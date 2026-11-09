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
const store = { get: (n: string) => (token ? { name: n, value: token } : undefined), set: (a: any, b?: any) => { token = typeof a === "string" ? b : a.value; }, delete: () => { token = null; } };
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
