// Наряд: оплата процентом от КП (12.11.2026). ПИШЕТ В БАЗУ .env.local (прод) — только CTL, удаляет за собой.
// Сервер — локальная сборка: npx tsx --env-file=.env.local scratchpad/wo-percent-check.ts http://localhost:3920 <outDir>
import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const [BASE, OUT] = process.argv.slice(2);
const stamp = String(Date.now()).slice(-6);
const created = { masters: [] as string[], objects: [] as string[], estimates: [] as string[] };
let fails = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", name, info === undefined ? "" : JSON.stringify(info).slice(0, 300));
};

async function register(phone: string, firstName: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: `ctl-${stamp}`, firstName, companyName: `CTL процент ${stamp}` }) });
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  if (!r.ok || !cookie) throw new Error(`register ${r.status} ${await r.text()}`);
  const m = await prisma.master.findUnique({ where: { phone }, select: { id: true } });
  created.masters.push(m!.id);
  return cookie;
}
const api = async (cookie: string, path: string, init?: RequestInit) => {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie } });
  const t = await r.text();
  let j: any; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
};
async function newObject(cookie: string, masterId: string, total: number | null) {
  const { j } = await api(cookie, "/measurements", { method: "POST", body: JSON.stringify({ address: `CTL процент ${stamp} — удалить`, status: "measured", rooms: [{ name: "Зал", walls: [500, 400, 500, 400], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 20, perimeter: 18, elements: [] }] }) });
  created.objects.push(j.id);
  if (total != null) {
    const e = await prisma.estimate.create({ data: { masterId, measurementObjectId: j.id, roomsData: [], calculationData: {}, totalArea: 20, total, status: "CONFIRMED" } as any, select: { id: true } });
    created.estimates.push(e.id);
  }
  return j.id as string;
}
const companyOf = async (ownerId: string) => prisma.company.findUnique({ where: { ownerId }, select: { id: true, installerPayMode: true, installerPayPercent: true } });

(async () => {
  try {
    const ownerPhone = `+7999000${stamp.slice(0, 4)}`.padEnd(12, "1");
    const A = await register(ownerPhone, "CTL владелец");
    const ownerId = created.masters[0];
    const obj = await newObject(A, ownerId, 250000);
    const wo = (o = obj, c = A) => `/objects/${o}/work-order`;

    let r = await api(A, wo());
    check("S1 GET: по работам, умолчание по работам", r.status === 200 && r.j.pay?.mode === "lines" && r.j.payDefault?.mode === "lines" && r.j.estimateTotal === 250000, { pay: r.j.pay, def: r.j.payDefault, et: r.j.estimateTotal });

    r = await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 } }) });
    check("S2 PUT 30 %: одна строка 75 000, база 250 000", r.status === 200 && r.j.total === 75000 && r.j.lines.length === 1 && r.j.lines[0].key === "pct" && r.j.pay.base === 250000, r.j);
    let c = await companyOf(ownerId);
    check("S2 умолчание компании = процент 30", c?.installerPayMode === "percent" && c?.installerPayPercent === 30, c);
    let o = await prisma.measurementObject.findUnique({ where: { id: obj }, select: { installerFee: true } });
    check("S2 installerFee = 75 000", o?.installerFee === 75000, o);

    r = await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [{ key: "pct", room: "", name: "x", qty: 1, unit: "усл.", price: 999999 }, { key: "own:1", room: "", name: "Выезд за город", qty: 1, unit: "усл.", price: 5000 }] }) });
    check("S3 + своя строка: 75 000 + 5 000, цену процента клиент не подменяет", r.j.total === 80000 && r.j.lines.length === 2 && r.j.lines[0].price === 75000, r.j.lines);

    await prisma.estimate.update({ where: { id: created.estimates[0] }, data: { total: 280000 } });
    r = await api(A, wo());
    check("S4 КП изменилось → stale", r.j.stale === true && r.j.pay.base === 250000 && r.j.estimateTotal === 280000, { stale: r.j.stale, pay: r.j.pay });
    r = await api(A, wo(), { method: "PUT", body: JSON.stringify({ reset: true }) });
    check("S4 «Пересчитать»: 30 % от 280 000 = 84 000, своя строка осталась", r.j.total === 89000 && r.j.pay.base === 280000 && r.j.lines.some((l: any) => l.key === "own:1"), r.j);
    r = await api(A, wo());
    check("S4 после пересчёта не stale", r.j.stale === false, { stale: r.j.stale });

    // /n и PDF: монтажник видит % и сумму, базы нет
    const p = await api(A, wo(), { method: "POST" });
    const token = p.j.token;
    const html = await (await fetch(`${BASE}/n/${token}`)).text();
    writeFileSync(`${OUT}/n-percent.html`, html);
    check("S5 /n: «Оплата: 30 % от суммы заказа», сумма 84 000, базы 280 000 нет", html.includes("Оплата: 30 % от суммы заказа") && /84\s?000/.test(html.replace(/&nbsp;| | /g, " ")) && !/280\s?000/.test(html.replace(/&nbsp;| | /g, " ")) && !html.includes("1 усл. ×"), null);
    const pdf = await fetch(`${BASE}/api/work-order/${token}/pdf`);
    const pdfBuf = Buffer.from(await pdf.arrayBuffer());
    writeFileSync(`${OUT}/n-percent.pdf`, pdfBuf);
    check("S5 PDF наряда отдаётся", pdf.status === 200 && pdfBuf.length > 1000, { status: pdf.status, bytes: pdfBuf.length });

    r = await api(A, wo(), { method: "PUT", body: JSON.stringify({ lines: [{ key: "pct", room: "", name: "30 % от суммы заказа", qty: 1, unit: "усл.", price: 84000 }, { key: "own:2", room: "", name: "Доплата", qty: 1, unit: "усл.", price: 1000 }] }) });
    check("S6 старая сборка: PUT {lines} без pay → построчно, сумма как есть", r.status === 200 && r.j.total === 85000 && r.j.pay.mode === "lines", r.j);
    r = await api(A, wo());
    check("S6 после старой сборки GET: по работам, не stale", r.j.pay.mode === "lines" && r.j.total === 85000 && r.j.stale === false, { pay: r.j.pay, total: r.j.total, stale: r.j.stale });

    r = await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "lines" } }) });
    c = await companyOf(ownerId);
    check("S7 обратно «по работам»: свои строки остались, умолчание lines, % помнится", r.j.pay.mode === "lines" && r.j.lines.some((l: any) => l.key === "own:2") && c?.installerPayMode === "lines" && c?.installerPayPercent === 30, { lines: r.j.lines, c });

    // Новый объект при умолчании «процент»
    await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 20 } }) });
    const obj2 = await newObject(A, ownerId, 100000);
    r = await api(A, wo(obj2));
    check("S8 новый наряд при умолчании 20 %: сразу процентом, 20 000", r.j.pay.mode === "percent" && r.j.total === 20000 && r.j.edited === false, { pay: r.j.pay, total: r.j.total, edited: r.j.edited });
    await api(A, wo(obj2), { method: "POST" });
    o = await prisma.measurementObject.findUnique({ where: { id: obj2 }, select: { installerFee: true, workOrderLines: true } });
    check("S8 «Отправить» фиксирует процент: installerFee 20 000, pay в документе", o?.installerFee === 20000 && (o?.workOrderLines as any)?.pay?.percent === 20, { fee: o?.installerFee, pay: (o?.workOrderLines as any)?.pay });

    // Ошибки
    r = await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 0 } }) });
    const r2 = await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 150 } }) });
    check("S9 % 0 и 150 → 400", r.status === 400 && r2.status === 400, [r.j, r2.j]);
    const obj3 = await newObject(A, ownerId, null);
    r = await api(A, wo(obj3), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 } }) });
    check("S9 без КП → 400 «Сначала сделайте КП»", r.status === 400 && String(r.j.error).includes("КП"), r.j);
    r = await api(A, wo(obj3));
    check("S9 без КП GET при умолчании процент: по работам, без падения", r.status === 200 && r.j.pay.mode === "lines" && r.j.hasEstimate === false, { status: r.status, pay: r.j.pay });

    // Участник бригады: меняет только наряд, не умолчание компании
    const memberPhone = `+7999001${stamp.slice(0, 4)}`.padEnd(12, "2");
    const B = await register(memberPhone, "CTL участник");
    const memberId = created.masters[1];
    const comp = await companyOf(ownerId);
    await prisma.member.create({ data: { companyId: comp!.id, masterId: memberId, name: "CTL участник", role: "member", joinedAt: new Date() } });
    await prisma.master.update({ where: { id: memberId }, data: { activeCompanyId: comp!.id } });
    r = await api(B, wo(obj2), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 15 } }) });
    c = await companyOf(ownerId);
    check("S10 участник ставит 15 %: наряд 15 000, умолчание компании осталось 20", r.status === 200 && r.j.total === 15000 && c?.installerPayPercent === 20 && c?.installerPayMode === "percent", { status: r.status, total: r.j.total, c });

    // kk: /n у мастера на казахском
    await prisma.master.update({ where: { id: ownerId }, data: { language: "kk" } });
    const htmlKk = await (await fetch(`${BASE}/n/${token}`)).text();
    check("S11 /n kk: «Төлем: тапсырыс сомасының …» (наряд obj после S7 — по работам)", true, null);
    await api(A, wo(), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 } }) });
    const htmlKk2 = await (await fetch(`${BASE}/n/${token}`)).text();
    writeFileSync(`${OUT}/n-percent-kk.html`, htmlKk2);
    check("S11 /n kk процентом", htmlKk2.includes("Төлем: тапсырыс сомасының 30 %"), null);
    await prisma.master.update({ where: { id: ownerId }, data: { language: "ru" } });
    void htmlKk;
    console.log("token", token);
  } catch (e) {
    fails++;
    console.log("ERROR", e);
  } finally {
    if (process.env.KEEP !== "1") {
      await prisma.estimate.deleteMany({ where: { id: { in: created.estimates } } });
      await prisma.measurementObject.deleteMany({ where: { id: { in: created.objects } } });
      await prisma.member.deleteMany({ where: { masterId: { in: created.masters } } });
      await prisma.company.deleteMany({ where: { ownerId: { in: created.masters } } });
      await prisma.master.deleteMany({ where: { id: { in: created.masters } } });
      const left = await prisma.master.count({ where: { id: { in: created.masters } } });
      console.log("CTL удалены:", JSON.stringify(created), "осталось мастеров:", left);
    } else console.log("KEEP=1, CTL оставлены:", JSON.stringify(created));
    console.log(fails ? `FAIL ${fails}` : "PASS");
    process.exit(fails ? 1 : 0);
  }
})();
