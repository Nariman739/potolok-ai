// QA нового КП на реальных данных: время сборки/рендера, страницы, размер,
// галерея (типы + своё/библиотека), планы, сетка. Выборка — разные мастера/темы.
//   npx tsx --env-file=.env.local scratchpad/kp-qa.ts [N=40] [outDir]
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { KpDocument } from "@/lib/kp/pdf/KpDocument";
import { buildPdfData } from "@/lib/kp/pdf-data";
import { kindFromItemName } from "@/lib/kp/kinds";
import { tidyPlanForClientEx } from "@/lib/kp/plan-tidy";
import fs from "node:fs";

async function main() {
  const N = Number(process.argv[2] ?? 40);
  const out = process.argv[3];
  const since = new Date(Date.now() - 60 * 864e5);
  const all = await prisma.estimate.findMany({
    where: { deletedAt: null, createdAt: { gte: since }, calculationData: { not: null as never } },
    select: { id: true, publicId: true, masterId: true, roomsData: true, priceView: true, calculationData: true, clientName: true, master: { select: { kpConfig: true, coverPhotoUrl: true } } },
    orderBy: { createdAt: "desc" },
    take: 600,
  });
  console.log("estimates 60d:", all.length);
  // выборка: по одному-два на мастера, приоритет — разные темы/виды/фичи
  const seen = new Map<string, number>();
  const pick: typeof all = [];
  const feat = (e: (typeof all)[number]) => {
    const calc = e.calculationData as { rooms?: unknown[]; quickEstimate?: boolean; extraItems?: unknown[] } | null;
    const rd = Array.isArray(e.roomsData) ? (e.roomsData as unknown[]) : [];
    const cfg = (e.master.kpConfig ?? {}) as { template?: string; planStyle?: string };
    return { rooms: calc?.rooms?.length ?? 0, plans: rd.length, quick: !!calc?.quickEstimate, view: e.priceView, template: cfg.template ?? "-", planStyle: cfg.planStyle ?? "-", cover: !!e.master.coverPhotoUrl };
  };
  const score = (e: (typeof all)[number]) => { const f = feat(e); return (f.plans > 0 ? 3 : 0) + (f.rooms >= 5 ? 3 : 0) + (f.quick ? 2 : 0) + (f.view === "summary" ? 2 : 0) + (f.template !== "-" ? 1 : 0) + (f.cover ? 1 : 0); };
  for (const e of [...all].sort((a, b) => score(b) - score(a))) {
    const c = seen.get(e.masterId) ?? 0;
    if (c >= 2) continue;
    seen.set(e.masterId, c + 1);
    pick.push(e);
    if (pick.length >= N) break;
  }
  // + самые «тяжёлые» по числу комнат и позиций
  const heavy = [...all].sort((a, b) => {
    const ia = ((a.calculationData as { rooms?: { items?: unknown[] }[] })?.rooms ?? []).reduce((s, r) => s + (r.items?.length ?? 0), 0);
    const ib = ((b.calculationData as { rooms?: { items?: unknown[] }[] })?.rooms ?? []).reduce((s, r) => s + (r.items?.length ?? 0), 0);
    return ib - ia;
  }).slice(0, 3);
  for (const h of heavy) if (!pick.find((p) => p.id === h.id)) pick.push(h);

  const rows: string[] = [];
  const warn: string[] = [];
  let maxRender = 0, sumRender = 0;
  for (const e of pick) {
    const f = feat(e);
    let t0 = Date.now();
    let data;
    try { data = await buildPdfData(e.id); } catch (err) { warn.push(`${e.publicId.slice(0, 8)} buildPdfData FAIL: ${(err as Error).message}`); continue; }
    const tData = Date.now() - t0;
    if (data.estimate.isQuick) data.config = { ...data.config, format: "quick" };
    t0 = Date.now();
    let buf: Buffer;
    try { buf = await renderToBuffer(KpDocument({ data })); } catch (err) { warn.push(`${e.publicId.slice(0, 8)} render FAIL: ${(err as Error).message}`); continue; }
    const tRender = Date.now() - t0;
    maxRender = Math.max(maxRender, tRender); sumRender += tRender;
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const plans = data.estimate.rooms.filter((r) => r.plan).length;
    const gridded = data.estimate.rooms.filter((r) => r.plan && tidyPlanForClientEx(r.plan).gridded).length;
    const gal = data.gallery.map((g) => g.kind + (g.own ? "*" : "")).join(",");
    const line = `${e.publicId.slice(0, 8)} ${f.template.padEnd(8)} ${f.planStyle.padEnd(9)} ${(f.view ?? "-").padEnd(8)} ${f.quick ? "quick" : "full "} rooms=${f.rooms} plans=${plans}/${f.plans} grid=${gridded} pages=${pages} ${Math.round(buf.length / 1024)}KB data=${tData}ms render=${tRender}ms gal=[${gal}]`;
    rows.push(line);
    console.log(line);
    if (tRender > 4000) warn.push(`${e.publicId.slice(0, 8)} медленно: render ${tRender} ms`);
    if (buf.length > 4 * 1024 * 1024) warn.push(`${e.publicId.slice(0, 8)} большой PDF: ${Math.round(buf.length / 1024)} KB`);
    if (pages > 14) warn.push(`${e.publicId.slice(0, 8)} много страниц: ${pages}`);
    if (plans !== f.plans && f.plans > 0) warn.push(`${e.publicId.slice(0, 8)} план не у всех комнат: ${plans}/${f.plans}`);
    if (out) fs.writeFileSync(`${out}/qa-${e.publicId.slice(0, 8)}.pdf`, buf);
  }
  console.log("\n--- итого:", rows.length, "КП; render avg", Math.round(sumRender / Math.max(1, rows.length)), "ms, max", maxRender, "ms");
  console.log("--- предупреждения:", warn.length); for (const w of warn) console.log("  !", w);

  // Аудит распознавания типов по названиям позиций (ложные срабатывания = «лишнее» в галерее)
  const names = new Map<string, number>();
  for (const e of all) {
    const calc = e.calculationData as { rooms?: { items?: { name?: string }[] }[]; extraItems?: { name?: string }[] } | null;
    for (const it of [...(calc?.rooms ?? []).flatMap((r) => r.items ?? []), ...(calc?.extraItems ?? [])]) {
      if (!it.name) continue;
      names.set(it.name, (names.get(it.name) ?? 0) + 1);
    }
  }
  const byKind = new Map<string, [string, number][]>();
  for (const [n, c] of names) { const k = kindFromItemName(n) ?? "(нет)"; const arr = byKind.get(k) ?? []; arr.push([n, c]); byKind.set(k, arr); }
  console.log("\n--- названия позиций → тип (60 дней,", names.size, "уникальных)");
  for (const [k, arr] of [...byKind].sort()) {
    arr.sort((a, b) => b[1] - a[1]);
    console.log(`\n[${k}] ${arr.length}`);
    for (const [n, c] of arr.slice(0, k === "(нет)" ? 80 : 40)) console.log(`   ${String(c).padStart(4)}  ${n}`);
  }
  await prisma.$disconnect();
}
main();
