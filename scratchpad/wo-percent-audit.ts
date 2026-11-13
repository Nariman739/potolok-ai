// Наряд процентом — сценарии аудитора (12.11.2026): случайный тап не стирает правки.
// ПИШЕТ В БАЗУ .env.local (прод) — только CTL, удаляет за собой.
//   npx tsx --env-file=.env.local scratchpad/wo-percent-audit.ts http://localhost:3920
import { prisma } from "@/lib/prisma";

const [BASE] = process.argv.slice(2);
const stamp = String(Date.now()).slice(-6);
const created = { masters: [] as string[], objects: [] as string[], estimates: [] as string[] };
let fails = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", name, info === undefined ? "" : JSON.stringify(info).slice(0, 260));
};
async function register(phone: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: `ctl-${stamp}`, firstName: "CTL", companyName: `CTL аудит ${stamp}` }) });
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  if (!r.ok || !cookie) throw new Error(`register ${r.status}`);
  created.masters.push((await prisma.master.findUnique({ where: { phone }, select: { id: true } }))!.id);
  return cookie;
}
const api = async (cookie: string, path: string, init?: RequestInit) => {
  const r = await fetch(`${BASE}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie } });
  const t = await r.text();
  let j: any; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
};
async function newObject(cookie: string, masterId: string, total: number) {
  const { j } = await api(cookie, "/measurements", { method: "POST", body: JSON.stringify({ address: `CTL аудит ${stamp} — удалить`, status: "measured", rooms: [{ name: "Зал", walls: [500, 400, 500, 400], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 20, perimeter: 18, elements: [] }] }) });
  created.objects.push(j.id);
  const e = await prisma.estimate.create({ data: { masterId, measurementObjectId: j.id, roomsData: [], calculationData: {}, totalArea: 20, total, status: "CONFIRMED" } as never, select: { id: true } });
  created.estimates.push(e.id);
  return { obj: j.id as string, est: e.id };
}
const fee = async (id: string) => (await prisma.measurementObject.findUnique({ where: { id }, select: { installerFee: true } }))?.installerFee;
// «Правленые» строки по работам: ставки/количества, которые мастер поправил в наряде
const EDITED = [
  { key: "Зал:ii:0:canvas", room: "Зал", name: "Монтаж полотна", qty: 20, unit: "м²", price: 1100, code: "install_canvas" },
  { key: "Зал:ii:1:spot", room: "Зал", name: "Монтаж софита", qty: 6, unit: "шт.", price: 700, code: "install_spot" },
];
const sum = (ls: any[]) => Math.round(ls.reduce((s, l) => s + l.qty * l.price, 0));

(async () => {
  try {
    const A = await register(`+7999002${stamp.slice(0, 4)}`);
    const owner = created.masters[0];
    const wo = (o: string) => `/objects/${o}/work-order`;

    // (а) правки → процент → обратно: строки и installerFee как до тапа
    const a = await newObject(A, owner, 250000);
    await api(A, wo(a.obj), { method: "PUT", body: JSON.stringify({ lines: [...EDITED, { key: "own:1", room: "", name: "Выезд", qty: 1, unit: "усл.", price: 3000 }] }) });
    const feeBefore = await fee(a.obj);
    let r = await api(A, wo(a.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [{ key: "own:1", room: "", name: "Выезд", qty: 1, unit: "усл.", price: 3000 }] }) });
    check("(а) процент: 75 000 + 3 000", r.j.total === 78000, r.j.total);
    r = await api(A, wo(a.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "lines" }, lines: [{ key: "own:1", room: "", name: "Выезд", qty: 1, unit: "усл.", price: 3000 }] }) });
    const keysA = r.j.lines.map((l: any) => `${l.key}:${l.price}`).sort();
    check("(а) обратно: правленые ставки на месте, своя строка не задвоилась", JSON.stringify(keysA) === JSON.stringify(["own:1:3000", "Зал:ii:0:canvas:1100", "Зал:ii:1:spot:700"].sort()), keysA);
    check("(а) installerFee как до тапа", (await fee(a.obj)) === feeBefore && feeBefore === sum(EDITED) + 3000, { before: feeBefore, after: await fee(a.obj) });
    r = await api(A, wo(a.obj));
    check("(а) GET после возврата: по работам, не stale, бэкапа в документе нет", r.j.pay.mode === "lines" && r.j.stale === false && !(await prisma.measurementObject.findUnique({ where: { id: a.obj }, select: { workOrderLines: true } }) as any).workOrderLines.linesBackup, { pay: r.j.pay, stale: r.j.stale });

    // (б) ручная сумма fee → процент → обратно: fee на месте
    const b = await newObject(A, owner, 100000);
    await prisma.measurementObject.update({ where: { id: b.obj }, data: { installerFee: 42000 } });
    r = await api(A, wo(b.obj));
    check("(б) ручная сумма видна строкой fee", r.j.lines.length === 1 && r.j.lines[0].key === "fee" && r.j.total === 42000, r.j.lines);
    await api(A, wo(b.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [] }) });
    check("(б) процентом installerFee 30 000", (await fee(b.obj)) === 30000, await fee(b.obj));
    r = await api(A, wo(b.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "lines" }, lines: [] }) });
    check("(б) обратно: «Оплата за монтаж 42 000», installerFee 42 000", r.j.lines.length === 1 && r.j.lines[0].key === "fee" && r.j.total === 42000 && (await fee(b.obj)) === 42000, r.j.lines);

    // (в) правки → процент → КП изменилось → правка своей строки → обратно: правки на месте + stale
    const c = await newObject(A, owner, 200000);
    await api(A, wo(c.obj), { method: "PUT", body: JSON.stringify({ lines: EDITED }) });
    await api(A, wo(c.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 20 }, lines: [] }) });
    await prisma.estimate.update({ where: { id: c.est }, data: { total: 300000 } });
    r = await api(A, wo(c.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 20 }, lines: [{ key: "own:9", room: "", name: "Доплата", qty: 1, unit: "усл.", price: 1000 }] }) });
    check("(в) своя строка процентом после смены КП: база прежняя (40 000), не молча 60 000; stale", r.j.lines[0].price === 40000 && r.j.stale === true, { pct: r.j.lines[0].price, stale: r.j.stale });
    r = await api(A, wo(c.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "lines" }, lines: [{ key: "own:9", room: "", name: "Доплата", qty: 1, unit: "усл.", price: 1000 }] }) });
    check("(в) обратно: правленые ставки + своя строка, stale=true (КП менялось)", r.j.total === sum(EDITED) + 1000 && r.j.stale === true, { total: r.j.total, stale: r.j.stale });

    // (г) старая сборка: PUT {lines} без pay, строка pct цела + своя строка → pay сохранён
    const d = await newObject(A, owner, 250000);
    await api(A, wo(d.obj), { method: "PUT", body: JSON.stringify({ lines: EDITED }) });
    r = await api(A, wo(d.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [] }) });
    const pctLine = r.j.lines[0];
    r = await api(A, wo(d.obj), { method: "PUT", body: JSON.stringify({ lines: [{ ...pctLine, name: "что угодно" }, { key: "own:5", room: "", name: "Выезд", qty: 1, unit: "усл.", price: 2000 }] }) });
    check("(г) старая сборка, pct цела: режим процент, 75 000 + 2 000", r.j.pay.mode === "percent" && r.j.total === 77000, { pay: r.j.pay, total: r.j.total });
    r = await api(A, wo(d.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "lines" }, lines: [{ key: "own:5", room: "", name: "Выезд", qty: 1, unit: "усл.", price: 2000 }] }) });
    check("(г) бэкап пережил правку старой сборкой: обратно — правленые ставки", r.j.total === sum(EDITED) + 2000, r.j.total);

    // (д) старая сборка поменяла сумму pct → осознанный выход из процента
    await api(A, wo(d.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [] }) });
    r = await api(A, wo(d.obj), { method: "PUT", body: JSON.stringify({ lines: [{ ...pctLine, price: 50000 }] }) });
    check("(д) старая сборка правит сумму pct → построчно, 50 000", r.j.pay.mode === "lines" && r.j.total === 50000, { pay: r.j.pay, total: r.j.total });

    // (е) участник: canSetDefault=false; владелец — true
    r = await api(A, wo(d.obj));
    check("(е) владелец: canSetDefault=true", r.j.canSetDefault === true, r.j.canSetDefault);
    const B = await register(`+7999003${stamp.slice(0, 4)}`);
    const member = created.masters[1];
    const comp = await prisma.company.findUnique({ where: { ownerId: owner }, select: { id: true } });
    await prisma.member.create({ data: { companyId: comp!.id, masterId: member, name: "CTL участник", role: "member", joinedAt: new Date() } });
    await prisma.master.update({ where: { id: member }, data: { activeCompanyId: comp!.id } });
    r = await api(B, wo(d.obj));
    check("(е) участник: canSetDefault=false", r.j.status !== 404 && r.j.canSetDefault === false, r.j.canSetDefault);

    // (ж) бэкап не утекает монтажнику: /n по токену не содержит правленых ставок из бэкапа
    const e = await newObject(A, owner, 250000);
    await api(A, wo(e.obj), { method: "PUT", body: JSON.stringify({ lines: [{ key: "Зал:ii:0:canvas", room: "Зал", name: "СекретнаяСтрокаБэкапа", qty: 1, unit: "шт.", price: 12345 }] }) });
    await api(A, wo(e.obj), { method: "PUT", body: JSON.stringify({ pay: { mode: "percent", percent: 30 }, lines: [] }) });
    const tok = (await api(A, wo(e.obj), { method: "POST" })).j.token;
    const html = await (await fetch(`${BASE}/n/${tok}`)).text();
    const pdf = Buffer.from(await (await fetch(`${BASE}/api/work-order/${tok}/pdf`)).arrayBuffer()).toString("latin1");
    check("(ж) /n: строки бэкапа нет, процент есть", !html.includes("СекретнаяСтрокаБэкапа") && !html.includes("12345") && html.includes("Оплата: 30 %"), null);
    check("(ж) PDF собран (текст в PDF сжат — проверяем по /n)", pdf.startsWith("%PDF"), null);
  } catch (err) {
    fails++;
    console.log("ERROR", err);
  } finally {
    await prisma.estimate.deleteMany({ where: { id: { in: created.estimates } } });
    await prisma.measurementObject.deleteMany({ where: { id: { in: created.objects } } });
    await prisma.member.deleteMany({ where: { masterId: { in: created.masters } } });
    await prisma.company.deleteMany({ where: { ownerId: { in: created.masters } } });
    await prisma.master.deleteMany({ where: { id: { in: created.masters } } });
    console.log("CTL удалены:", JSON.stringify(created), "осталось мастеров:", await prisma.master.count({ where: { id: { in: created.masters } } }));
    console.log(fails ? `FAIL ${fails}` : "PASS");
    process.exit(fails ? 1 : 0);
  }
})();
