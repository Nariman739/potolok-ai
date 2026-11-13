// Сверка (только чтение): «КП монтажнику» = наряд по всем КП за 30 дней.
//   npx tsx --env-file=.env.local scratchpad/installer-pdf-recon.ts
// 1) model.total = итог наряда (сохранённого от этого КП, иначе авто-строки, без нулей).
// 2) Независимо: КП из приложения — сумма installerItems + допы installerPrice (что видит мастер
//    во вкладке «Монтажнику»); расхождение допустимо только из-за починки бага ×0,3 (до 29.10).
import { prisma } from "@/lib/prisma";
import { autoWorkOrderLines, parseWorkOrderDoc, workOrderTotal } from "@/lib/work-order-lines";
import { installerPdfModel } from "@/lib/installer-pdf-lines";
import { priceMapFor } from "@/lib/price-items";
import { pickPrimaryEstimate } from "@/lib/object-stage";
// Только чтение: компанию прайса ищем, НЕ ensureOwnCompany (та создаёт компанию).
const bookOf = async (companyId: string | null, masterId: string) => companyId ?? (await prisma.company.findUnique({ where: { ownerId: masterId }, select: { id: true } }))?.id ?? null;
const keep = setInterval(() => {}, 1000);
(async () => {
  try {
    const since = new Date(Date.now() - 30 * 864e5);
    const es = await prisma.estimate.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: { id: true, createdAt: true, masterId: true, companyId: true, calculationData: true, master: { select: { currency: true } }, measurementObject: { select: { workOrderLines: true, installerFee: true, estimates: { where: { deletedAt: null }, select: { id: true, status: true, createdAt: true, deletedAt: true } } } } },
    });
    const cache = new Map<string, Record<string, number>>();
    let feeCnt = 0, feeNotPrimary = 0, dupNames = 0, roomBad = 0; const exR: string[] = []; let mobDiffNew = 0, unexplained = 0; const exU: string[] = []; const exNew: string[] = []; let diff = 0, fromDoc = 0, pct = 0, mob = 0, mobDiff = 0, spotsFixed = 0;
    const ex: string[] = [];
    for (const e of es) {
      const calc = e.calculationData as any;
      const cur = e.master.currency || "KZT";
      if (!cache.has(e.masterId)) cache.set(e.masterId, await (async () => { const b = await bookOf(e.companyId, e.masterId); return b ? priceMapFor(b, cur) : {}; })());
      const prices = cache.get(e.masterId)!;
      const saved = e.measurementObject?.workOrderLines ?? null;
      const fee = e.measurementObject?.installerFee ?? null;
      const primaryId = e.measurementObject ? pickPrimaryEstimate(e.measurementObject.estimates)?.id ?? null : null;
      const m = installerPdfModel(calc, prices, cur, e.id, saved, e.measurementObject ? { installerFee: fee, primaryEstimateId: primaryId } : null);
      // Комнаты: «Помещений» = различимые комнаты; одноимённые с разным roomId — разные группы с своей площадью
      const rrsAll: any[] = calc?.roomResults ?? calc?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
      const keyArea = new Map<string, number>();
      for (const r of rrsAll) { const k = r.roomId ?? r.roomName ?? ""; keyArea.set(k, (keyArea.get(k) ?? 0) + (r.area ?? 0)); }
      const names = rrsAll.map((r) => r.roomName); if (new Set(names).size < names.length) dupNames++;
      const roomGroups = m.rooms.filter((r) => r.area != null);
      const areaOk = roomGroups.every((g) => [...keyArea.values()].some((a) => Math.abs(a - g.area!) < 1e-6));
      if (m.roomCount !== keyArea.size || roomGroups.length > keyArea.size || !areaOk) { roomBad++; if (exR.length < 3) exR.push(`${e.id.slice(0, 8)} count ${m.roomCount}/${keyArea.size} groups ${roomGroups.length}`); }
      const doc = parseWorkOrderDoc(saved);
      const own = doc && doc.estimateId === e.id;
      if (own) { fromDoc++; if (doc!.pay) pct++; }
      // Как GET наряда: сохранённый от этого КП → ручная сумма без наряда → авто-строки
      // Ручная сумма — только главному КП и только > 0 (замечание 8d)
      const byFee = !doc && (fee ?? 0) > 0 && primaryId === e.id;
      if (!doc && (fee ?? 0) > 0 && primaryId !== e.id) feeNotPrimary++;
      if (byFee) feeCnt++;
      const wo = workOrderTotal((own ? doc!.lines : byFee ? [{ key: "fee", room: "", name: "", qty: 1, unit: "", price: fee! }] : autoWorkOrderLines(calc, prices, cur)).filter((l) => l.qty > 0 && l.price > 0));
      if (m.total !== wo) { diff++; if (ex.length < 5) ex.push(`${e.id.slice(0, 8)} pdf ${m.total} наряд ${wo}`); }
      const rrs = calc?.roomResults ?? [];
      if (rrs.some((r: any) => r.installerItems?.length) && !own && !byFee) {
        mob++;
        const tab = Math.round(rrs.reduce((s: number, r: any) => s + (r.installerItems ?? []).reduce((a: number, i: any) => a + (i.quantity > 0 ? i.quantity * Math.max(0, Math.round(i.unitPrice || 0)) : 0), 0), 0)
          + (calc.extraItems ?? []).reduce((s: number, x: any) => s + (x.itemCode !== "min_order" && x.installerPrice > 0 && x.quantity > 0 ? x.quantity * Math.round(x.installerPrice) : 0), 0));
        const auto = autoWorkOrderLines(calc, prices, cur);
        // Строки, где авто-наряд починил ставку ×0,3 (старые сборки) — сумма по ставке из installerItems
        const fixedTab = Math.round(rrs.reduce((s: number, r: any, ri: number) => s + (r.installerItems ?? []).reduce((a: number, i: any, ii: number) => { if (!(i.quantity > 0)) return a; const key = `${r.roomId ?? r.roomName ?? ""}:ii:${ii}:${i.itemCode}`; const l = auto.find((x) => x.key === key); return a + i.quantity * (l ? l.price : Math.max(0, Math.round(i.unitPrice || 0))); }, 0), 0)
          + (calc.extraItems ?? []).reduce((s: number, x: any) => s + (x.itemCode !== "min_order" && x.installerPrice > 0 && x.quantity > 0 ? x.quantity * Math.round(x.installerPrice) : 0), 0));
        if (tab !== m.total && fixedTab !== m.total) { unexplained++; if (exU.length < 5) exU.push(`${e.id.slice(0, 8)} вкладка ${tab} починка ${fixedTab} pdf ${m.total}`); }
        if (tab !== m.total) { mobDiff++; if (e.createdAt >= new Date("2026-10-30T00:00:00Z")) { mobDiffNew++; if (exNew.length < 4) exNew.push(`${e.id.slice(0, 8)} вкладка ${tab} pdf ${m.total}`); } }
        if (!(calc.totalSpots > 0) && m.spots > 0) spotsFixed++;
      }
    }
    console.log({ КП: es.length, PDF_не_равно_наряду: diff, из_сохранённого_наряда: fromDoc, ручная_сумма_installerFee: feeCnt, ручная_сумма_у_неглавного_КП_не_печатаем: feeNotPrimary, КП_с_одноимёнными_комнатами: dupNames, комнаты_не_сошлись: roomBad, из_них_процентом: pct, мобилка_авто: mob, мобилка_не_равно_вкладке: mobDiff, светильники_было0_стало_число: spotsFixed, мобилка_не_равно_вкладке_после_30_10: mobDiffNew, не_объяснено_починкой_x03: unexplained }); console.log(exU.join("\n")); console.log(exNew.join("\n"));
    if (ex.length) console.log(ex.join("\n"));
    if (exR.length) console.log(exR.join("\n"));
    console.log(diff || roomBad ? "FAIL" : "PASS");
  } catch (err) { console.log("ERR", err); }
  clearInterval(keep); process.exit(0);
})();
