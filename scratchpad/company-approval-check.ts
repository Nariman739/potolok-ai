// Подтверждение владельцем (09.11.2026): настоящие обработчики маршрутов на ЛОКАЛЬНОМ Postgres.
// Заглушены только куки (next/headers) и внешние отправки (fetch → счётчик пушей).
// LOCAL_DB=postgresql://qa@127.0.0.1:54399/capprove PGADAPTER=<каталог с pg и @prisma/adapter-pg> \
//   npx tsx --tsconfig tsconfig.json scratchpad/company-approval-check.ts
/* eslint-disable */
const Module = require("module");
const LOCAL = process.env.LOCAL_DB || "";
if (!/^postgresql:\/\/[^@]*@127\.0\.0\.1:\d+\//.test(LOCAL)) { console.error("только локальная база"); process.exit(2); }
process.env.DATABASE_URL = LOCAL;
delete process.env.TELEGRAM_BOT_TOKEN;

let token: string | null = null;
const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();
const cur = () => (als.getStore() as string | undefined) ?? token;
const store = { get: (n: string) => (cur() ? { name: n, value: cur() as string } : undefined), set: (a: any, b?: any) => { token = typeof a === "string" ? b : a.value; }, delete: () => { token = null; } };
const hdr = new Map<string, string>();
const orig = Module._load;
Module._load = function (req: string, ...rest: any[]) {
  if (req === "next/headers") return { cookies: async () => store, headers: async () => hdr };
  return orig.call(this, req, ...rest);
};
let pushes: { to: string; title: string; body: string; data: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  if (String(url).includes("exp.host")) {
    const msgs = JSON.parse(init.body);
    for (const m of msgs) pushes.push(m);
    return new Response(JSON.stringify({ data: msgs.map(() => ({ status: "ok" })) }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 200 });
};

const { PrismaPg } = require(process.env.PGADAPTER + "/node_modules/@prisma/adapter-pg");
const { PrismaClient } = require("@/generated/prisma/client");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: LOCAL }) });
(globalThis as any).prisma = db;

const register = require("@/app/api/auth/register/route");
const company = require("@/app/api/company/route");
const sw = require("@/app/api/company/switch/route");
const member = require("@/app/api/company/members/[id]/route");
const decision = require("@/app/api/company/members/[id]/decision/route");
const account = require("@/app/api/account/route");
const { getScope, companyIdFor } = require("@/lib/company");

let fails = 0, n = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { n++; if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : " → " + JSON.stringify(got)}`); };
const req = (body?: unknown, ip = "1.1.1.1") => new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body ?? {}) });
const J = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
let ipN = 10;
async function reg(phone: string, firstName: string) {
  token = null;
  const r = await J(await register.POST(req({ phone, password: "secret12", firstName }, `9.9.9.${ipN++}`)));
  if (r.status !== 200) throw new Error("register " + JSON.stringify(r));
  return { id: r.body.id as string, token: token as string | null, phone: r.body.phone as string };
}
const as = (u: { token: string | null }) => { token = u.token; };
const GET = async (u: any) => { as(u); return J(await company.GET()); };
const accept = async (u: any, companyId: string, extra: object = {}) => { as(u); return J(await sw.POST(req({ companyId, approvalFlow: true, ...extra }))); };
const acceptOld = async (u: any, companyId: string, extra: object = {}) => { as(u); return J(await sw.POST(req({ companyId, ...extra }))); };
const addPhone = async (owner: any, phone: string, name = "Ерлан") => { as(owner); return J(await company.POST(req({ name, phone }))); };
const decide = async (u: any, id: string, approve: boolean) => { as(u); return J(await decision.POST(req({ approve }), { params: Promise.resolve({ id }) })); };
const patch = async (u: any, id: string, body: object) => { as(u); return J(await member.PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })); };
const asUser = <T,>(u: any, f: () => Promise<T>) => als.run(u.token, f) as Promise<T>;
const pDecide = (u: any, id: string, approve: boolean) => asUser(u, async () => J(await decision.POST(req({ approve }), { params: Promise.resolve({ id }) })));
const pCancel = (u: any) => asUser(u, async () => J(await sw.POST(req({ cancelPending: true }))));
const row = (id: string) => db.member.findUnique({ where: { id } });
const master = (id: string) => db.master.findUnique({ where: { id } });
const device = (id: string, t: string) => db.pushDevice.create({ data: { masterId: id, token: `ExponentPushToken[${t}]`, platform: "ios" } });
const pushesTo = (t: string) => pushes.filter((p) => p.to.includes(t)).length;
let ph = 77011000000;
const nextPhone = () => `+${++ph}`;
async function ownerWithCompany(label: string) {
  const o = await reg(nextPhone(), label);
  await device(o.id, "own" + o.id);
  const g = await GET(o);
  return { ...o, companyId: g.body.companyId as string, tag: "own" + o.id };
}
async function invited(owner: any, label: string) {
  const phone = nextPhone();
  const add = await addPhone(owner, phone);
  const u = await reg(phone, label);
  await device(u.id, "usr" + u.id);
  return { ...u, memberId: add.body.member.id as string, tag: "usr" + u.id };
}

(async () => {
  console.log("— приём приглашения: доступа нет —");
  {
    const o = await ownerWithCompany("Владелец1");
    const u = await invited(o, "Самозванец");
    await db.client.create({ data: { masterId: o.id, companyId: o.companyId, name: "Клиент компании", phone: "+77000000001" } });
    const phoneReg = u.phone;
    const dupRes = await addPhone(o, phoneReg, "Тот же");
    ok("ответ на добавление не раскрывает masterId", !("masterId" in dupRes.body.member), dupRes.body.member);
    const fresh = await addPhone(o, (await reg(nextPhone(), "Зарегистрированный")).phone, "Новый");
    ok("…и для нового зарегистрированного номера", !("masterId" in fresh.body.member), fresh.body.member);
    const pat = await patch(o, u.memberId, { name: "Ерлан" });
    ok("ответ PATCH не раскрывает masterId", pat.status === 200 && !("masterId" in pat.body), pat.body);
    let g = await GET(u);
    ok("приглашение видно после регистрации на номер", g.body.invites.length === 1 && g.body.pendingJoin === null, g.body);
    const a = await accept(u, o.companyId);
    ok("новый клиент: 200 { pending }", a.status === 200 && a.body.pending === true, a);
    const m = await master(u.id);
    ok("activeCompanyId не поставлен", m.activeCompanyId === null, m.activeCompanyId);
    const r0 = await row(u.memberId);
    ok("joinedAt пуст, pendingSince заполнен", r0.joinedAt === null && !!r0.pendingSince, r0);
    g = await GET(u);
    ok("вместо приглашения — ожидание", g.body.invites.length === 0 && g.body.pendingJoin?.companyId === o.companyId, g.body);
    const scope = await getScope({ id: u.id, activeCompanyId: null });
    ok("scope — своя компания", scope.companyId !== o.companyId && scope.isOwner, scope.companyId);
    const forced = await getScope({ id: u.id, activeCompanyId: o.companyId });
    ok("подделанный activeCompanyId не даёт компанию при заявке", forced.companyId !== o.companyId, forced.companyId);
    await db.master.update({ where: { id: u.id }, data: { activeCompanyId: o.companyId } });
    ok("companyIdFor при заявке — не компания", (await companyIdFor(u.id)) !== o.companyId);
    await db.master.update({ where: { id: u.id }, data: { activeCompanyId: null } });
    const og = await GET(o);
    ok("владельцу видна заявка: имя и телефон аккаунта", og.body.approvals.length === 1 && og.body.approvals[0].name === "Самозванец" && og.body.approvals[0].phone === u.phone, og.body.approvals);
    ok("в «Людях» строка помечена pending", og.body.members.find((x: any) => x.id === u.memberId)?.pending === true);
    ok("masterId заявителя владельцу не раскрыт в members", og.body.members.find((x: any) => x.id === u.memberId)?.masterId === null);
    ok("владелец получил один пуш с переходом в «Люди»", pushesTo(o.tag) === 1 && pushes.find((p) => p.to.includes(o.tag))?.data.screen === "/company", pushesTo(o.tag));
    const again = await accept(u, o.companyId, { bringData: false });
    ok("повторный «Принять» идемпотентен, без пуша", again.status === 200 && pushesTo(o.tag) === 1, again);
    const self = await decide(u, u.memberId, true);
    ok("заявитель не может подтвердить сам себя", self.status === 404, self);
    const stranger = await ownerWithCompany("Чужой");
    ok("чужой владелец не может подтвердить", (await decide(stranger, u.memberId, true)).status === 404);
    const ok1 = await decide(o, u.memberId, true);
    ok("владелец подтвердил", ok1.status === 200 && ok1.body.approved === true, ok1);
    const m2 = await master(u.id);
    const r2 = await row(u.memberId);
    ok("сразу в компании, joinedAt есть, заявка снята", m2.activeCompanyId === o.companyId && !!r2.joinedAt && r2.pendingSince === null, { m2: m2.activeCompanyId, r2 });
    const sc = await getScope({ id: u.id, activeCompanyId: o.companyId });
    ok("scope = компания владельца, заявитель в masterIds", sc.companyId === o.companyId && sc.masterIds.includes(u.id), sc.masterIds);
    ok("заявителю пуш «подтвердили»", pushes.some((p) => p.to.includes(u.tag) && p.title.includes("подтвердили")));
    const dbl = await decide(o, u.memberId, true);
    ok("повторное подтверждение — 404, без побочных эффектов", dbl.status === 404, dbl);
    as(u); await J(await sw.POST(req({ own: true })));
    const back = await acceptOld(u, o.companyId);
    ok("подтверждённый возвращается одним тапом, без заявки (и на старой сборке)", back.status === 200 && (await master(u.id)).activeCompanyId === o.companyId, back);
    const r3 = await row(u.memberId);
    ok("новой заявки при возврате нет", r3.pendingSince === null);
    const worker = u;
    const another = await invited(o, "Второй");
    await accept(another, o.companyId);
    ok("работающий участник (не владелец) не может подтвердить", (await decide(worker, another.memberId, true)).status === 404);
  }

  console.log("— старый клиент —");
  {
    const o = await ownerWithCompany("Владелец2");
    const u = await invited(o, "НаСтаройСборке");
    const a = await acceptOld(u, o.companyId);
    ok("409 с текстом про подтверждение", a.status === 409 && /после подтверждения/.test(a.body.error) && a.body.code === "APPROVAL_PENDING", a);
    ok("заявка создана, доступа нет", !!(await row(u.memberId)).pendingSince && (await master(u.id)).activeCompanyId === null);
    const g = await GET(u);
    ok("приглашение из старого списка ушло (карточка исчезнет)", g.body.invites.length === 0, g.body.invites);
    await db.master.update({ where: { id: u.id }, data: { language: "kk" } });
    const k = await acceptOld(u, o.companyId);
    ok("казахский текст для kk", k.status === 409 && /Өтінім/.test(k.body.error), k);
  }

  console.log("— перенос данных —");
  {
    const o = await ownerWithCompany("Владелец3");
    const u = await invited(o, "СДанными");
    const own = (await GET(u)).body.companyId;
    const c = await db.client.create({ data: { masterId: u.id, companyId: own, name: "Его клиент", phone: "+77000000002" } });
    await accept(u, o.companyId, { bringData: true });
    ok("до подтверждения данные не перенесены", (await db.client.findUnique({ where: { id: c.id } })).companyId === own);
    ok("pendingBringData запомнен", (await row(u.memberId)).pendingBringData === true);
    const g = await GET(o);
    ok("владелец видит, что перенесётся", g.body.approvals[0].bring?.clients === 1, g.body.approvals);
    const d = await decide(o, u.memberId, true);
    ok("при подтверждении перенесены", (await db.client.findUnique({ where: { id: c.id } })).companyId === o.companyId && d.body.transferred?.clients === 1, d);

    const b = await invited(o, "Бригадир");
    const bOwn = (await GET(b)).body.companyId;
    const helper = await invited(b, "ЕгоРабочий");
    await accept(helper, bOwn);
    await decide(b, helper.memberId, true);
    const blocked = await accept(b, o.companyId, { bringData: true });
    ok("перенос запрещён, если в своей компании работают люди (заявка не создана)", blocked.status === 409 && /работают другие люди/.test(blocked.body.error) && (await row(b.memberId)).pendingSince === null, blocked);
    ok("без переноса заявка создаётся", (await accept(b, o.companyId)).status === 200);

    const late = await invited(o, "Поздний");
    const lateOwn = (await GET(late)).body.companyId;
    const lc = await db.client.create({ data: { masterId: late.id, companyId: lateOwn, name: "Клиент", phone: "+77000000003" } });
    await accept(late, o.companyId, { bringData: true });
    const lh = await invited(late, "ПоявилсяПозже");
    await accept(lh, lateOwn);
    await decide(late, lh.memberId, true);
    const ld = await decide(o, late.memberId, true);
    ok("люди появились за время ожидания: подтверждение проходит без переноса", ld.status === 200 && ld.body.transferSkipped === true && (await db.client.findUnique({ where: { id: lc.id } })).companyId === lateOwn, ld);
  }

  console.log("— одна заявка за раз —");
  {
    const o1 = await ownerWithCompany("ВладелецА");
    const o2 = await ownerWithCompany("ВладелецБ");
    const phone = nextPhone();
    const a1 = await addPhone(o1, phone);
    const a2 = await addPhone(o2, phone);
    const u = await reg(phone, "ДвойноеПриглашение");
    await accept(u, o1.companyId);
    await accept(u, o2.companyId);
    ok("вторая заявка снимает первую", (await row(a1.body.member.id)).pendingSince === null && !!(await row(a2.body.member.id)).pendingSince);
    ok("снятая заявка снова выглядит приглашением", (await GET(u)).body.invites.length === 1);
  }

  console.log("— СЦЕНАРИИ ОТКЛОНЕНИЯ —");
  {
    const o = await ownerWithCompany("Владелец4");
    const u = await invited(o, "Отклонённый");
    const pushesBefore = pushesTo(o.tag);
    await accept(u, o.companyId);
    ok("(уведомление о заявке)", pushesTo(o.tag) === pushesBefore + 1);
    const d = await decide(o, u.memberId, false);
    const r = await row(u.memberId);
    ok("отклонение: аккаунт отвязан, строка осталась, rejectedAt", d.status === 200 && r.masterId === null && !!r.rejectedAt && r.pendingSince === null && r.removedAt === null, r);
    ok("заявителю пуш «не подтвердил»", pushes.some((p) => p.to.includes(u.tag) && p.title.includes("не подтвердил")));
    const og = await GET(o);
    ok("у владельца бейдж rejected, заявка ушла", og.body.members.find((x: any) => x.id === u.memberId)?.rejected === true && og.body.approvals.length === 0, og.body);

    // Сценарий 1
    const g = await GET(u);
    const retry = await accept(u, o.companyId);
    ok("СЦЕНАРИЙ 1 повторная заявка невозможна: приглашения нет, заявка 404", g.body.invites.length === 0 && g.body.pendingJoin === null && retry.status === 404 && (await row(u.memberId)).pendingSince === null, { g: g.body.invites, retry });
    ok("(пушей владельцу не прибавилось)", pushesTo(o.tag) === pushesBefore + 1);

    // Правка имени блокировку не снимает
    await patch(o, u.memberId, { name: "Новое имя", phone: u.phone });
    ok("правка имени блокировку не снимает", !!(await row(u.memberId)).rejectedAt);

    // Сценарий 2
    as(u);
    const del = await J(await account.DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ password: "secret12", confirmPhrase: "УДАЛИТЬ АККАУНТ" }) })));
    ok("(аккаунт удалён)", del.status === 200 && (await master(u.id)) === null, del);
    const u2 = await reg(u.phone, "ТотЖеНомерЗаново");
    const r2 = await row(u.memberId);
    const g2 = await GET(u2);
    ok("СЦЕНАРИЙ 2 удаление аккаунта + новая регистрация на номер: приглашения нет", r2.masterId === null && !!r2.rejectedAt && g2.body.invites.length === 0 && g2.body.pendingJoin === null, { r2, g2: g2.body.invites });

    // Участник не может пригласить снова
    const w = await invited(o, "Участник");
    await accept(w, o.companyId); await decide(o, w.memberId, true);
    as(w);
    const byMember = await addPhone(w, u.phone);
    ok("повторно пригласить отклонённый номер может только владелец", byMember.status === 403 && !!(await row(u.memberId)).rejectedAt, byMember);
    const byMemberPatch = await patch(w, u.memberId, { phone: nextPhone() });
    ok("сменить отклонённый номер может только владелец", byMemberPatch.status === 403, byMemberPatch);

    // Сценарий 3
    const pBefore = pushesTo(o.tag);
    const re = await addPhone(o, u.phone);
    const r3 = await row(u.memberId);
    const g3 = await GET(u2);
    ok("СЦЕНАРИЙ 3 повторное добавление владельцем снова открывает заявку", re.status === 200 && r3.rejectedAt === null && r3.masterId === u2.id && r3.joinedAt === null && g3.body.invites.length === 1, { r3, g3: g3.body.invites });
    const ac3 = await accept(u2, o.companyId);
    ok("…заявка подаётся, владелец снова уведомлён", ac3.status === 200 && !!(await row(u.memberId)).pendingSince && pushesTo(o.tag) === pBefore + 1, ac3);

    // Смена телефона снимает блокировку
    const x = await invited(o, "Опечатка");
    await accept(x, o.companyId); await decide(o, x.memberId, false);
    await patch(o, x.memberId, { phone: nextPhone() });
    ok("другой телефон снимает блокировку", (await row(x.memberId)).rejectedAt === null);
  }

  console.log("— цикл отзывов —");
  {
    const o = await ownerWithCompany("Владелец5");
    const u = await invited(o, "Циклист");
    await accept(u, o.companyId);
    const p1 = pushesTo(o.tag);
    for (let i = 0; i < 5; i++) {
      as(u); const c = await J(await sw.POST(req({ cancelPending: true })));
      if (c.status !== 200) throw new Error("cancel " + JSON.stringify(c));
      await accept(u, o.companyId);
    }
    ok("СЦЕНАРИЙ 4 цикл отзывов: один пуш в сутки", p1 === 1 && pushesTo(o.tag) === 1, pushesTo(o.tag));
    ok("…заявка при этом есть и видна владельцу", (await GET(o)).body.approvals.length === 1);
    await db.member.update({ where: { id: u.memberId }, data: { approvalPushAt: new Date(Date.now() - 25 * 3600 * 1000) } });
    as(u); await J(await sw.POST(req({ cancelPending: true })));
    await accept(u, o.companyId);
    ok("…через сутки уведомление снова приходит", pushesTo(o.tag) === 2, pushesTo(o.tag));
    as(u); await J(await sw.POST(req({ cancelPending: true })));
    ok("отзыв снимает заявку, приглашение остаётся", (await row(u.memberId)).pendingSince === null && (await GET(u)).body.invites.length === 1);
  }

  console.log("— гонки (настоящие параллельные запросы) —");
  {
    const o = await ownerWithCompany("ВладелецГонки");
    let aWon = 0, rWon = 0, cancelWon = 0, aWon2 = 0;
    for (let i = 0; i < 12; i++) {
      const u = await invited(o, "Гонка" + i);
      const own = (await GET(u)).body.companyId;
      const c = await db.client.create({ data: { masterId: u.id, companyId: own, name: "К", phone: "+7700000" + (1000 + i) } });
      await accept(u, o.companyId, { bringData: true });
      const before = pushes.filter((p) => p.to.includes(u.tag)).length;
      const [a, r] = await Promise.all([pDecide(o, u.memberId, true), new Promise((t) => setTimeout(t, i * 6)).then(() => pDecide(o, u.memberId, false))]);
      const m = await master(u.id), rw = await row(u.memberId), cl = await db.client.findUnique({ where: { id: c.id } });
      const sent = pushes.filter((p) => p.to.includes(u.tag)).length - before;
      const approved = a.status === 200 && r.status === 404, rejected = r.status === 200 && a.status === 404;
      ok(`подтвердить+отклонить #${i}: победил один, один пуш`, (approved || rejected) && sent === 1, { a, r, sent });
      if (approved) { aWon++; ok(`  подтверждено: в компании, перенос`, m.activeCompanyId === o.companyId && !!rw.joinedAt && rw.masterId === u.id && cl.companyId === o.companyId, { m: m.activeCompanyId, rw, cl: cl.companyId }); }
      if (rejected) { rWon++; ok(`  отклонено: не в компании, без переноса`, m.activeCompanyId !== o.companyId && rw.joinedAt === null && rw.masterId === null && cl.companyId === own, { m: m.activeCompanyId, rw, cl: cl.companyId }); }
    }
    for (let i = 0; i < 12; i++) {
      const u = await invited(o, "Отзыв" + i);
      const own = (await GET(u)).body.companyId;
      const c = await db.client.create({ data: { masterId: u.id, companyId: own, name: "К", phone: "+7700000" + (2000 + i) } });
      await accept(u, o.companyId, { bringData: true });
      const [a] = await Promise.all([pDecide(o, u.memberId, true), new Promise((t) => setTimeout(t, i * 6)).then(() => pCancel(u))]);
      const m = await master(u.id), rw = await row(u.memberId), cl = await db.client.findUnique({ where: { id: c.id } });
      if (a.status === 200) { aWon2++; ok(`подтвердить+отозвать #${i}: подтверждено целиком`, m.activeCompanyId === o.companyId && !!rw.joinedAt && rw.pendingSince === null && cl.companyId === o.companyId, { m: m.activeCompanyId, rw, cl: cl.companyId }); }
      else { cancelWon++; ok(`подтвердить+отозвать #${i}: отозвано, ничего не применилось`, a.status === 404 && m.activeCompanyId !== o.companyId && rw.joinedAt === null && rw.pendingSince === null && cl.companyId === own, { a, m: m.activeCompanyId, rw, cl: cl.companyId }); }
    }
    console.log(`  итог: подтверждение ${aWon} / отклонение ${rWon}; подтверждение ${aWon2} / отзыв ${cancelWon}`);
  }

  console.log("— финальное ревью: «Принять» + подтверждение, устаревшее отклонение, смена переноса —");
  {
    const pAccept = (u: any, companyId: string, extra: object = {}) => asUser(u, async () => J(await sw.POST(req({ companyId, approvalFlow: true, ...extra }))));
    const o = await ownerWithCompany("ВладелецФ");
    let fast = 0, idem = 0;
    for (let i = 0; i < 12; i++) {
      const u = await invited(o, "ПринятьПодтв" + i);
      await accept(u, o.companyId);
      const [d, a] = await Promise.all([pDecide(o, u.memberId, true), new Promise((t) => setTimeout(t, i * 5)).then(() => pAccept(u, o.companyId))]);
      const rw = await row(u.memberId), m = await master(u.id);
      if (a.body?.pending) idem++; else fast++;
      ok(`«Принять»+подтверждение #${i}: подтверждён, заявка не залипла`, d.status === 200 && a.status === 200 && !!rw.joinedAt && rw.pendingSince === null && m.activeCompanyId === o.companyId, { d, a, rw, m: m.activeCompanyId });
    }
    console.log(`  итог: повторная заявка до подтверждения ${idem} / быстрый путь после ${fast}`);

    let before = 0;
    for (let i = 0; i < 8; i++) {
      const u = await invited(o, "СначалаПринять" + i);
      await accept(u, o.companyId);
      const [a, d] = await Promise.all([pAccept(u, o.companyId), new Promise((t) => setTimeout(t, 40 + i * 10)).then(() => pDecide(o, u.memberId, true))]);
      const rw = await row(u.memberId);
      if (a.body?.pending) before++;
      ok(`сначала «Принять», потом подтверждение #${i}`, a.status === 200 && d.status === 200 && !!rw.joinedAt && rw.pendingSince === null, { a, d, rw });
    }
    console.log(`  итог: заявка обновилась до подтверждения ${before} из 8`);

    // Детерминированно: владелец подтвердил между чтением строки и записью заявки.
    const race = await invited(o, "МеждуЧтениемИЗаписью");
    await accept(race, o.companyId);
    const origFind = db.member.findFirst.bind(db.member);
    let fired = false;
    const hook = async (args: any) => {
      const res = await origFind(args);
      if (!fired && res && args?.where?.masterId === race.id && args?.select?.pendingSince) {
        fired = true;
        await db.member.update({ where: { id: race.memberId }, data: { joinedAt: new Date(), pendingSince: null, pendingBringData: null } });
      }
      return res;
    };
    let patched = true;
    try { db.member.findFirst = hook; patched = db.member.findFirst === hook; } catch { patched = false; }
    if (patched) {
      const a = await pAccept(race, o.companyId);
      db.member.findFirst = origFind;
      const rw = await row(race.memberId), m = await master(race.id);
      ok("подтверждён между чтением и записью: заявка не создаётся, быстрый путь", fired && a.status === 200 && !a.body.pending && !!rw.joinedAt && rw.pendingSince === null && m.activeCompanyId === o.companyId, { fired, a, rw });
    } else console.log("  (подмена findFirst недоступна, ветка проверена только гонкой)");

    const w = await invited(o, "Работает");
    await accept(w, o.companyId);
    await decide(o, w.memberId, true);
    const late = await decide(o, w.memberId, false);
    const r1 = await row(w.memberId);
    ok("«Отклонить» после подтверждения: 404, участник на месте", late.status === 404 && r1.masterId === w.id && !!r1.joinedAt && r1.rejectedAt === null && (await master(w.id)).activeCompanyId === o.companyId, { late, r1 });
    await db.member.update({ where: { id: w.memberId }, data: { pendingSince: new Date() } });
    const stale = await decide(o, w.memberId, false);
    const r2 = await row(w.memberId);
    ok("устаревшая заявка у подтверждённого: отклонение не снимает", stale.status === 404 && r2.masterId === w.id && r2.rejectedAt === null && (await master(w.id)).activeCompanyId === o.companyId, { stale, r2 });
    await db.member.update({ where: { id: w.memberId }, data: { pendingSince: null } });

    let flip = 0, took = 0;
    for (let i = 0; i < 10; i++) {
      const u = await invited(o, "Перенос" + i);
      const own = (await GET(u)).body.companyId;
      const c = await db.client.create({ data: { masterId: u.id, companyId: own, name: "К", phone: "+7700000" + (4000 + i) } });
      await accept(u, o.companyId, { bringData: true });
      const [d] = await Promise.all([pDecide(o, u.memberId, true), new Promise((t) => setTimeout(t, i)).then(() => pAccept(u, o.companyId, { bringData: false }))]);
      const rw = await row(u.memberId), cl = await db.client.findUnique({ where: { id: c.id } });
      if (d.status === 200) { took++; ok(`смена переноса #${i}: подтверждено с прочитанным выбором`, !!rw.joinedAt && rw.pendingSince === null && (d.body.transferred ? cl.companyId === o.companyId : cl.companyId === own), { d, rw, cl: cl.companyId }); }
      else { flip++; ok(`смена переноса #${i}: 404, заявка жива, перенос не применён`, d.status === 404 && rw.joinedAt === null && !!rw.pendingSince && rw.pendingBringData === false && cl.companyId === own, { d, rw, cl: cl.companyId }); }
    }
    console.log(`  итог: подтверждено ${took} / 404 из-за смены ${flip}`);
  }

  console.log("— подтверждённое приглашение помечено —");
  {
    const o = await ownerWithCompany("ВладелецК");
    const u = await invited(o, "Вернётся");
    let g = await GET(u);
    ok("новое приглашение: confirmed=false", g.body.invites[0].confirmed === false, g.body.invites);
    await accept(u, o.companyId); await decide(o, u.memberId, true);
    as(u); await J(await sw.POST(req({ own: true })));
    g = await GET(u);
    ok("подтверждённый: confirmed=true", g.body.invites[0].confirmed === true, g.body.invites);
  }

  console.log("— уволенный не возвращается без владельца —");
  {
    const o = await ownerWithCompany("ВладелецУ");
    await db.client.create({ data: { masterId: o.id, companyId: o.companyId, name: "Клиент компании", phone: "+77000005000" } });
    const col = await invited(o, "Коллега");
    await accept(col, o.companyId); await decide(o, col.memberId, true);
    const del = (u: any, id: string) => asUser(u, async () => J(await member.DELETE(new Request("http://x"), { params: Promise.resolve({ id }) })));

    // Уволили → коллега добавил → заявка → владелец решает
    const ex = await invited(o, "Уволенный");
    await accept(ex, o.companyId); await decide(o, ex.memberId, true);
    ok("(работал в компании)", (await master(ex.id)).activeCompanyId === o.companyId);
    await del(o, ex.memberId);
    let r = await row(ex.memberId);
    ok("увольнение: joinedAt и заявка сброшены, активная компания снята", !!r.removedAt && r.joinedAt === null && r.pendingSince === null && (await master(ex.id)).activeCompanyId === null, r);
    const back = await addPhone(col, ex.phone, "Вернул коллега");
    r = await row(ex.memberId);
    ok("коллега добавил: строка жива, но не подтверждена", back.status === 200 && r.removedAt === null && r.joinedAt === null, { back, r });
    let g = await GET(ex);
    ok("у уволенного приглашение без confirmed", g.body.invites.length === 1 && g.body.invites[0].confirmed === false, g.body.invites);
    const a1 = await accept(ex, o.companyId);
    ok("вход только заявкой, активной компании нет", a1.body.pending === true && (await master(ex.id)).activeCompanyId === null, a1);
    const sc = await getScope({ id: ex.id, activeCompanyId: o.companyId });
    ok("база компании закрыта", sc.companyId !== o.companyId, sc.companyId);
    const notOwner = await decide(col, ex.memberId, true);
    ok("коллега подтвердить не может", notOwner.status === 404, notOwner);
    ok("владелец видит заявку", (await GET(o)).body.approvals.some((x: any) => x.id === ex.memberId));
    const yes = await decide(o, ex.memberId, true);
    ok("владелец подтвердил — снова в компании", yes.status === 200 && (await master(ex.id)).activeCompanyId === o.companyId && !!(await row(ex.memberId)).joinedAt, yes);

    // Тот же путь с отказом
    const ex2 = await invited(o, "УволенныйОтказ");
    await accept(ex2, o.companyId); await decide(o, ex2.memberId, true);
    await del(o, ex2.memberId); await addPhone(col, ex2.phone); await accept(ex2, o.companyId);
    const no = await decide(o, ex2.memberId, false);
    const r2 = await row(ex2.memberId);
    ok("владелец отклонил — доступа нет, номер заблокирован", no.status === 200 && r2.masterId === null && !!r2.rejectedAt && r2.joinedAt === null && (await master(ex2.id)).activeCompanyId === null, { no, r2 });

    // Убранный до этой правки: joinedAt остался в базе
    const legacy = await invited(o, "УбранДоПравки");
    await accept(legacy, o.companyId); await decide(o, legacy.memberId, true);
    await del(o, legacy.memberId);
    await db.member.update({ where: { id: legacy.memberId }, data: { joinedAt: new Date() } });
    await addPhone(col, legacy.phone);
    const lr = await row(legacy.memberId);
    g = await GET(legacy);
    ok("убранный до правки: восстановление сбрасывает joinedAt", lr.joinedAt === null && g.body.invites[0]?.confirmed === false, { lr, g: g.body.invites });
    ok("…и входит только заявкой", (await accept(legacy, o.companyId)).body.pending === true);

    // Владелец возвращает сам — тоже через заявку
    const byOwner = await invited(o, "ВернулВладелец");
    await accept(byOwner, o.companyId); await decide(o, byOwner.memberId, true);
    await del(o, byOwner.memberId); await addPhone(o, byOwner.phone);
    ok("возврат владельцем — тоже через заявку", (await row(byOwner.memberId)).joinedAt === null && (await accept(byOwner, o.companyId)).body.pending === true);

    // Работающие не задеты
    const before = await row(col.memberId);
    await addPhone(o, col.phone, "Коллега");
    const after = await row(col.memberId);
    ok("повторное добавление работающего номера joinedAt не сбрасывает", !!after.joinedAt && after.joinedAt.getTime() === before.joinedAt.getTime() && (await master(col.id)).activeCompanyId === o.companyId, after);
    as(col); await J(await sw.POST(req({ own: true })));
    const tap = await accept(col, o.companyId);
    ok("подтверждённый: «в свою и обратно» одним тапом", tap.status === 200 && !tap.body.pending && (await master(col.id)).activeCompanyId === o.companyId, tap);
    const os = await getScope({ id: o.id, activeCompanyId: o.companyId });
    ok("владелец не задет", os.isOwner && os.masterIds.includes(o.id) && os.masterIds.includes(col.id), os.masterIds);

    // Коллега не снимает блокировку отклонённого
    const rej = await invited(o, "ОтклонённыйНомер");
    await accept(rej, o.companyId); await decide(o, rej.memberId, false);
    const d1 = await del(col, rej.memberId);
    const add1 = await addPhone(col, rej.phone);
    const rr = await row(rej.memberId);
    ok("коллега убрал отклонённого и добавил снова: 403, блокировка на месте", d1.status === 200 && add1.status === 403 && !!rr.rejectedAt && !!rr.removedAt, { d1, add1, rr });
    const rs = await addPhone(o, rej.phone);
    ok("владелец может снять", rs.status === 200 && (await row(rej.memberId)).rejectedAt === null, rs);
  }

  console.log("— доступ требует joinedAt —");
  {
    const o = await ownerWithCompany("ВладелецJ");
    const u = await invited(o, "БезJoined");
    await db.client.create({ data: { masterId: o.id, companyId: o.companyId, name: "К", phone: "+77000003000" } });
    await db.master.update({ where: { id: u.id }, data: { activeCompanyId: o.companyId } });
    const sc = await getScope({ id: u.id, activeCompanyId: o.companyId });
    ok("неподтверждённая строка с устаревшим activeCompanyId: своя компания", sc.companyId !== o.companyId, sc.companyId);
    ok("companyIdFor: не компания", (await companyIdFor(u.id)) !== o.companyId);
    const os = await getScope({ id: o.id, activeCompanyId: o.companyId });
    ok("такой человек не в masterIds компании и не «в приложении»", !os.masterIds.includes(u.id) && os.members.find((m: any) => m.id === u.memberId)?.hasApp === false, os.masterIds);
    await db.master.update({ where: { id: u.id }, data: { activeCompanyId: null } });
    const ownerRow = await db.member.findFirst({ where: { companyId: o.companyId, role: "owner" } });
    await db.member.update({ where: { id: ownerRow.id }, data: { joinedAt: null } });
    await db.master.update({ where: { id: o.id }, data: { activeCompanyId: o.companyId } });
    const os2 = await getScope({ id: o.id, activeCompanyId: o.companyId });
    ok("владелец со строкой без joinedAt доступ не теряет", os2.companyId === o.companyId && os2.isOwner && os2.masterIds.includes(o.id), os2.companyId);
    await db.member.update({ where: { id: ownerRow.id }, data: { joinedAt: new Date() } });
  }

  console.log("— подтверждение при работе в другой компании, текст про перенос, имя приглашения —");
  {
    const o = await ownerWithCompany("ВладелецЗ");
    const other = await ownerWithCompany("ДругаяКомпания");
    const phone = nextPhone();
    const a1 = await addPhone(o, phone, "Записан Владельцем");
    const a2 = await addPhone(other, phone, "В другой");
    const u = await reg(phone, "ИмяАккаунта");
    await device(u.id, "usr" + u.id);
    await accept(u, other.companyId); await decide(other, a2.body.member.id, true);
    ok("(работает в другой компании)", (await master(u.id)).activeCompanyId === other.companyId);
    const own = (await db.company.findUnique({ where: { ownerId: u.id } })).id;
    const c = await db.client.create({ data: { masterId: u.id, companyId: own, name: "К", phone: "+77000003001" } });
    await accept(u, o.companyId, { bringData: true });
    const ap = (await GET(o)).body.approvals[0];
    ok("карточка: имя аккаунта и как записал владелец", ap.name === "ИмяАккаунта" && ap.invitedName === "Записан Владельцем", ap);
    const d = await decide(o, a1.body.member.id, true);
    const m = await master(u.id), rw = await row(a1.body.member.id);
    ok("не перекинут: joinedAt есть, activeCompanyId прежний", d.body.movedIn === false && !!rw.joinedAt && m.activeCompanyId === other.companyId, { d, m: m.activeCompanyId });
    ok("перенос не выполнен", (await db.client.findUnique({ where: { id: c.id } })).companyId === own);
    ok("пуш говорит, что не переключили", pushes.some((p) => p.to.includes("usr" + u.id) && /не переключили/.test(p.body)));
    const inv = (await GET(u)).body.invites.find((x: any) => x.companyId === o.companyId);
    ok("приглашение видно для быстрого перехода", !!inv);
    const back = await accept(u, o.companyId);
    ok("«Принять» — сразу, без заявки", back.status === 200 && !back.body.pending && (await master(u.id)).activeCompanyId === o.companyId, back);

    const b = await ownerWithCompany("ВладелецП");
    const l = await invited(b, "ПереносПропущен");
    const lOwn = (await GET(l)).body.companyId;
    await db.client.create({ data: { masterId: l.id, companyId: lOwn, name: "К", phone: "+77000003002" } });
    await accept(l, b.companyId, { bringData: true });
    const h = await invited(l, "Появился");
    await accept(h, lOwn); await decide(l, h.memberId, true);
    const d2 = await decide(b, l.memberId, true);
    ok("transferSkipped: в пуше про данные", d2.body.transferSkipped === true && pushes.some((p) => p.to.includes(l.tag) && /остались у вас/.test(p.body)), d2);
  }

  console.log("— края —");
  {
    const o = await ownerWithCompany("Владелец6");
    const u = await invited(o, "Убранный");
    await accept(u, o.companyId);
    as(o); const del = await J(await member.DELETE(new Request("http://x"), { params: Promise.resolve({ id: u.memberId }) }));
    ok("убрали из «Людей» — заявка снята", del.status === 200 && (await row(u.memberId)).pendingSince === null && (await GET(u)).body.pendingJoin === null, del);

    const v = await invited(o, "УдалилсяПриЗаявке");
    await accept(v, o.companyId);
    as(v); await J(await account.DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ password: "secret12", confirmPhrase: "УДАЛИТЬ АККАУНТ" }) })));
    ok("аккаунт удалён при заявке: у владельца заявки нет", (await GET(o)).body.approvals.length === 0);
    const v2 = await reg(v.phone, "НовыйНаЭтотНомер");
    const vr = await row(v.memberId);
    ok("новый аккаунт на номер: не в заявке, надо согласиться самому", vr.masterId === v2.id && vr.pendingSince === null && (await GET(v2)).body.invites.length === 1, vr);

    const j = await invited(o, "БылПодтверждён");
    await accept(j, o.companyId); await decide(o, j.memberId, true);
    as(j); await J(await account.DELETE(new Request("http://x", { method: "DELETE", body: JSON.stringify({ password: "secret12", confirmPhrase: "УДАЛИТЬ АККАУНТ" }) })));
    const j2 = await reg(j.phone, "НовыйВладелецНомера");
    const jr = await row(j.memberId);
    ok("дыра а): новый владелец номера подтверждённого — joinedAt сброшен", jr.masterId === j2.id && jr.joinedAt === null, jr);
    const ja = await accept(j2, o.companyId);
    ok("…и входит только через заявку", ja.body.pending === true && (await master(j2.id)).activeCompanyId === null, ja);

    const legacy = await invited(o, "РаботалДоПодтверждений");
    await db.member.update({ where: { id: legacy.memberId }, data: { joinedAt: new Date() } });
    await db.master.update({ where: { id: legacy.id }, data: { activeCompanyId: o.companyId } });
    const ls = await getScope({ id: legacy.id, activeCompanyId: o.companyId });
    ok("работавший до подтверждений не затронут", ls.companyId === o.companyId && ls.masterIds.includes(legacy.id));
  }

  console.log(fails ? `ПРОВАЛОВ: ${fails} из ${n}` : `ВСЕ ПРОВЕРКИ ПРОШЛИ: ${n}`);
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ОШИБКА СТЕНДА:", e); process.exit(3); });
