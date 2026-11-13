// Часть Б стенда А7: create/confirm/pricing через HTTP. prep → печатает id; run <base>; clean
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { writeFileSync, readFileSync } from "fs";
const keep = setInterval(() => {}, 1000);
const F = "scratchpad/vtb-a7-http.json";
const [cmd, BASE] = process.argv.slice(2);
let fails = 0;
const check = (n: string, ok: boolean, i?: unknown) => { if (!ok) fails++; console.log(ok ? "ok  " : "FAIL", n, i === undefined ? "" : JSON.stringify(i).slice(0, 200)); };
(async () => {
  try {
    if (cmd === "prep") {
      const s = String(Date.now()).slice(-6);
      const pass = `ctl${s}`;
      const mk = async (p: string, n: string) => (await prisma.master.create({ data: { phone: p, passwordHash: await hashPassword(pass), firstName: n } as never, select: { id: true, phone: true } }));
      const a = await mk(`+7999007${s.slice(0, 4)}`, "CTL ВТБ QA");
      const b = await mk(`+7999008${s.slice(0, 4)}`, "CTL ВТБ мастер");
      writeFileSync(F, JSON.stringify({ a, b, pass }));
      console.log(a.id);
    } else if (cmd === "run") {
      const { a, b, pass } = JSON.parse(readFileSync(F, "utf8"));
      const login = async (phone: string) => { const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.77" }, body: JSON.stringify({ phone, password: pass }) }); return r.headers.get("set-cookie")!.split(";")[0]; };
      const A = await login(a.phone), B = await login(b.phone);
      const post = (c: string, p: string, body: unknown) => fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: c }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
      let r = await post(B, "/api/payment/vtb/create", { period: "month" });
      check("Б1 песочница: обычный мастер → create 503", r.status === 503, r);
      r = await post(A, "/api/payment/vtb/create", { period: "month" });
      check("Б2 песочница: мастер из VTB_TEST_MASTER_IDS → create 200 + formUrl", r.status === 200 && !!r.j?.formUrl, r.status);
      const pid = r.j?.paymentId;
      const pp = await prisma.pendingPayment.findUnique({ where: { id: pid }, select: { comment: true } });
      check("Б2 заявка помечена «(ВТБ, ТЕСТ)»", pp?.comment === "Оплата картой (ВТБ, ТЕСТ)", pp?.comment);
      const before = (await prisma.master.findUnique({ where: { id: a.id }, select: { paidUntil: true } }))!.paidUntil;
      r = await post(A, "/api/payment/vtb/confirm", { paymentId: pid });
      const after = (await prisma.master.findUnique({ where: { id: a.id }, select: { paidUntil: true } }))!.paidUntil;
      check("Б3 confirm после «оплаты» песочницы → status TEST, PRO не включён", r.j?.status === "TEST" && String(before) === String(after), { j: r.j, before, after });
      const html = await (await fetch(`${BASE}/pricing`, { headers: { Cookie: A } })).text();
      check("Б4 /pricing: тестовая заявка не в истории (нет «Отклонена»)", !html.includes("Отклонена"));
    } else if (cmd === "clean") {
      const { a, b } = JSON.parse(readFileSync(F, "utf8"));
      const ids = [a.id, b.id];
      await prisma.pendingPayment.deleteMany({ where: { masterId: { in: ids } } });
      await prisma.session.deleteMany({ where: { masterId: { in: ids } } }).catch(() => null);
      await prisma.member.deleteMany({ where: { masterId: { in: ids } } });
      await prisma.company.deleteMany({ where: { ownerId: { in: ids } } });
      await prisma.master.deleteMany({ where: { id: { in: ids } } });
      console.log("CTL удалены, осталось:", await prisma.master.count({ where: { id: { in: ids } } }));
    }
  } catch (e) { fails++; console.log("ERROR", e); }
  console.log(fails ? `FAIL ${fails}` : "PASS");
  clearInterval(keep); process.exit(fails ? 1 : 0);
})();
