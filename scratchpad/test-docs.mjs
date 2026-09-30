// «Документы» в карточке объекта (30.09.2026): сводка, «без договора», данные клиента, ИИН в договоре, отправка, подпись на устройстве.
const API = process.env.API ?? "https://potolok.ai/api";
const SITE = API.replace(/\/api$/, "");
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "");
const text = (h) => strip(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const r0 = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r0.headers.get("set-cookie")?.split(";")[0] };

// Объект с КП без договора
const feed = await j(await fetch(`${API}/objects`, { headers: H }));
let obj = null;
for (const row of feed.filter((r) => r.kind === "object" && r.total > 0)) {
  const card = await j(await fetch(`${API}/objects/${row.id}`, { headers: H }));
  if (card?.docs?.estimateId && !card.docs.contract) { obj = card; break; }
}
check("нашли объект с КП без договора", !!obj);
if (!obj) process.exit(1);
const d0 = obj.docs;
check("сводка документов есть", d0 && "suggest" in d0 && d0.terms && typeof d0.terms.total === "number", JSON.stringify(d0).slice(0, 200));
check("условия: предоплата + остаток = сумма", d0.terms.prepayment + d0.terms.rest === d0.terms.total, JSON.stringify(d0.terms));

// Подсказка «договор» появляется после «Да»
let r = await fetch(`${API}/objects/${obj.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "confirmed" }) });
let card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("после «Да» подсказка — договор", card.docs.suggest === "contract", `${r.status} ${card.stage} ${card.docs.suggest}`);

// «Без договора» гасит подсказку, и обратно
await fetch(`${API}/objects/${obj.id}/docs`, { method: "PATCH", headers: H, body: JSON.stringify({ declined: true }) });
card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("«без договора»: подсказок нет", card.docs.declined === true && card.docs.suggest === null, JSON.stringify({ d: card.docs.declined, s: card.docs.suggest }));
await fetch(`${API}/objects/${obj.id}/docs`, { method: "PATCH", headers: H, body: JSON.stringify({ declined: false }) });
card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("вернули — подсказка снова «договор»", card.docs.declined === false && card.docs.suggest === "contract");

// Разбор ответа клиента
const reply = "Здравствуйте! Ахметова Гульмира Сериковна, г. Астана, ул. Кабанбай батыра 11, кв 45. ИИН 850101400123, тел 8 701 234 56 78";
r = await fetch(`${API}/objects/${obj.id}/client-data/parse`, { method: "POST", headers: H, body: JSON.stringify({ text: reply }) });
const parsed = (await j(r)).data ?? {};
check("разбор: ИИН", parsed.iin === "850101400123", JSON.stringify(parsed));
check("разбор: телефон", parsed.phone === "+77012345678", parsed.phone);
check("разбор: ФИО", /Ахметова Гульмира/.test(parsed.fullName ?? ""), parsed.fullName);
check("разбор: адрес", /Кабанбай/.test(parsed.address ?? "") && /45/.test(parsed.address ?? ""), parsed.address);

// Неверный ИИН не сохраняем
r = await fetch(`${API}/objects/${obj.id}/client-data`, { method: "POST", headers: H, body: JSON.stringify({ iin: "12345" }) });
check("ИИН не из 12 цифр — 400", r.status === 400);
r = await fetch(`${API}/objects/${obj.id}/client-data`, { method: "POST", headers: H, body: JSON.stringify(parsed) });
check("данные клиента сохранены", r.status === 200, String(r.status));
card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("данные в сводке", card.docs.client.iin === "850101400123" && /Ахметова/.test(card.docs.client.name ?? ""), JSON.stringify(card.docs.client));

// Договор: создаём с отметкой «отправлен», ИИН в реквизитах
r = await fetch(`${API}/estimates/${card.docs.estimateId}/contract/create`, { method: "POST", headers: H, body: JSON.stringify({ sent: true }) });
const c = await j(r);
check("договор создан", r.status === 200 && c.contractPublicId, JSON.stringify(c).slice(0, 100));
card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("договор в сводке: отправлен", !!card.docs.contract?.sentAt && !card.docs.contract.signedAt, JSON.stringify(card.docs.contract));
check("подсказки нет (договор есть, монтажа нет)", card.docs.suggest === null, card.docs.suggest);
const page = text(await (await fetch(`${SITE}/contract/${c.contractPublicId}?lang=ru`)).text());
check("в договоре ИИН заказчика", page.includes("850101400123"));
check("в договоре ФИО и адрес", /Ахметова Гульмира/.test(page) && /Кабанбай/.test(page));

// После монтажа подсказка — акт
await fetch(`${API}/objects/${obj.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "installed" }) });
card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("после монтажа подсказка — акт", card.docs.suggest === "act", `${card.stage} ${card.docs.suggest}`);

// Акт и подпись на устройстве мастера
r = await fetch(`${API}/estimates/${card.docs.estimateId}/act/create`, { method: "POST", headers: H, body: JSON.stringify({ sent: true }) });
const a = await j(r);
check("акт создан", r.status === 200 && a.actPublicId);
const actPage = await (await fetch(`${SITE}/act/${a.actPublicId}?by=device&lang=ru`)).text();
check("страница акта открывается для подписи на устройстве", /Есть замечания/.test(actPage) && /by=device/.test(actPage));
r = await fetch(`${API}/act/${a.actPublicId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "Ахметова Гульмира Сериковна", agreed: true, method: "device" }) });
card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H }));
check("акт подписан, способ «device»", !!card.docs.act?.signedAt && card.docs.act.signMethod === "device", JSON.stringify(card.docs.act).slice(0, 160));
check("подсказок больше нет", card.docs.suggest === null);

// Подписанный договор данные не меняет
await fetch(`${API}/contract/${c.contractPublicId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "Ахметова Гульмира", agreed: true }) });
r = await fetch(`${API}/objects/${obj.id}/client-data`, { method: "POST", headers: H, body: JSON.stringify({ fullName: "Другое Имя" }) });
check("после подписи договора данные не меняются (409)", r.status === 409, String(r.status));

// Заготовка «Мой договор» знает ИИН
const st = await j(await fetch(`${API}/contract/template/starter?lang=ru`, { headers: H }));
check("заготовка: метка {иин_клиента}", /\{иин_клиента\}/.test(st.body ?? ""));

// Возвращаем этап объекту
await fetch(`${API}/objects/${obj.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: null }) });
console.log(`\n${ok} ok, ${fail} fail (объект ${obj.id})`); process.exit(fail ? 1 : 0);
