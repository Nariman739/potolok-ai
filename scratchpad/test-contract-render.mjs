// Свой договор мастера печатается: метки в заготовке, подстановка в живой договор (26.09.2026).
const API = process.env.API ?? "https://potolok.ai/api";
const SITE = API.replace(/\/api$/, "");
const stripScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const r0 = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r0.headers.get("set-cookie")?.split(";")[0] };
const tagsOf = (b) => [...new Set([...b.matchAll(/\{[а-яё_]+\}/gi)].map((m) => m[0].toLowerCase()))];

// 1. Заготовка: всё, что зависит от заказа и профиля, — метками
const starter = await j(await fetch(`${API}/contract/template/starter?lang=ru`, { headers: H }));
const tags = tagsOf(starter.body ?? "");
for (const k of ["{дата}", "{город}", "{дата_начала}", "{срок}", "{гарантия_материал}", "{гарантия_монтаж}", "{телефон_исполнителя}", "{реквизиты_исполнителя}", "{номер}", "{предоплата}"]) {
  check(`заготовка: есть ${k}`, tags.includes(k), tags.join(" "));
}
check("заготовка: дата создания не запечена", !/20\d\d\s?г\./.test(starter.body) && !/2002/.test(starter.body), starter.body.match(/.{30}20\d\d.{20}/)?.[0]);
check("заготовка: маркеры не остались", !/@@|7777|8888|999 /.test(starter.body), starter.body.match(/.{20}(@@|7777|8888|999 ).{20}/)?.[0]);
const starterKk = await j(await fetch(`${API}/contract/template/starter?lang=kk`, { headers: H }));
const tagsKk = tagsOf(starterKk.body ?? "");
check("казахская заготовка: те же метки", ["{дата}", "{срок}", "{гарантия_материал}", "{дата_начала}"].every((k) => tagsKk.includes(k)), tagsKk.join(" "));
check("казахская заготовка: маркеры не остались", !/@@|7777|8888|999 |2002|2001/.test(starterKk.body), starterKk.body.match(/.{20}(@@|7777|8888|999 |2002|2001).{20}/)?.[0]);

// 2. Свой договор: 30/70 и пункт про мусор
const mine = starter.body
  .replace("Предоплата — 50%", "Предоплата — 30%")
  .replace("Окончательный расчёт — 50%", "Окончательный расчёт — 70%")
  .replace("<h2>3.", "<p>2.4. Строительный мусор Исполнитель вывозит сам.</p>\n  </div>\n  <h2>3.");
let r = await fetch(`${API}/contract/template`, { method: "POST", headers: H, body: JSON.stringify({ body: mine, note: "тест: 30/70 и мусор", language: "ru" }) });
const saved = await j(r);
check("свой договор сохранён", r.status === 200 && saved.template?.version >= 1, `${r.status} ${JSON.stringify(saved).slice(0, 120)}`);

// 3. Версия по id
const list = await j(await fetch(`${API}/contract/template?lang=ru`, { headers: H }));
const prev = (list.history ?? []).find((h) => !h.isActive);
if (prev) {
  const one = await j(await fetch(`${API}/contract/template/${prev.id}`, { headers: H }));
  check("старая версия читается целиком", typeof one.template?.body === "string" && one.template.body.length > 500, JSON.stringify(one).slice(0, 120));
}
const bad = await fetch(`${API}/contract/template/00000000-0000-0000-0000-000000000000`, { headers: H });
check("чужая/несуществующая версия — 404", bad.status === 404, String(bad.status));

// 4. Живой договор печатается из шаблона
const estimates = await j(await fetch(`${API}/estimates`, { headers: H }));
let target = null;
for (const e of (Array.isArray(estimates) ? estimates : []).filter((e) => e.total > 0).slice(0, 15)) {
  const full = await j(await fetch(`${API}/estimates/${e.id}`, { headers: H }));
  if (full && !full.contractSignedAt) { target = full; break; }
}
check("нашли неподписанное КП у QA", !!target, JSON.stringify(estimates).slice(0, 100));
if (target) {
  r = await fetch(`${API}/estimates/${target.id}/contract/create`, { method: "POST", headers: H, body: JSON.stringify({}) });
  const created = await j(r);
  check("договор создан/есть", r.status === 200 && created.contractPublicId, `${r.status} ${JSON.stringify(created).slice(0, 120)}`);
  const page = await (await fetch(`${SITE}/contract/${created.contractPublicId}?lang=ru`)).text();
  check("на странице пункт про мусор", /мусор Исполнитель вывозит сам/.test(page));
  check("на странице 30% и 70%", /30%/.test(page) && /70%/.test(page));
  const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₸";
  check("сумма предоплаты — 30% от итога", page.includes(fmt(target.total * 0.3)), `ждал ${fmt(target.total * 0.3)}; итог ${target.total}`);
  check("остаток — 70% от итога", page.includes(fmt(target.total * 0.7)), `ждал ${fmt(target.total * 0.7)}`);
  check("итог договора на месте", page.includes(fmt(target.total).replace(" ₸", "") + " ₸"), fmt(target.total));
  // Смотрим только видимую разметку: в dev-режиме Next кладёт в служебный
  // payload и сырой шаблон (отладка await), в проде его нет.
  const visible = stripScripts(page);
  check("меток на странице не осталось", !/\{[а-яё_]+\}/i.test(visible), visible.match(/\{[а-яё_]+\}/gi)?.slice(0, 5)?.join(" "));
  check("таблица работ заполнена", (page.match(/<tr>/g) ?? []).length >= 2, String((page.match(/<tr>/g) ?? []).length));
  check("имя клиента подставлено", !target.clientName || page.includes(target.clientName.replace(/&/g, "&amp;")), target.clientName);
  check("дата договора — не 2002 год", !/2002/.test(page) && /20\d\d\s?г\./.test(page));
  const pageKk = await (await fetch(`${SITE}/contract/${created.contractPublicId}?lang=kk`)).text();
  check("казахская страница открывается", /Тапсырыс беруші|Орындаушы/.test(pageKk));
}

// 5. Заморозка: подписанный договор не меняется, даже если мастер поправил шаблон
let fresh = null;
for (const e of (Array.isArray(estimates) ? estimates : []).filter((e) => e.total > 0).slice(0, 40)) {
  const full = await j(await fetch(`${API}/estimates/${e.id}`, { headers: H }));
  if (full && !full.contractPublicId) { fresh = full; break; }
}
if (!fresh) {
  console.log("ℹ️ у QA не осталось КП без договора — заморозку не проверяем");
} else {
  const frozenClause = "2.5. Подписанный текст заморожен тестом.";
  r = await fetch(`${API}/contract/template`, { method: "POST", headers: H, body: JSON.stringify({ body: mine.replace("<h2>3.", `<p>${frozenClause}</p>\n  </div>\n  <h2>3.`), note: "тест: заморозка", language: "ru" }) });
  check("шаблон с меткой заморозки сохранён", r.status === 200, String(r.status));
  r = await fetch(`${API}/estimates/${fresh.id}/contract/create`, { method: "POST", headers: H, body: JSON.stringify({}) });
  const made = await j(r);
  check("новый договор создан из шаблона", r.status === 200 && made.contractPublicId, JSON.stringify(made).slice(0, 100));
  let pg = await (await fetch(`${SITE}/contract/${made.contractPublicId}?lang=ru`)).text();
  check("до подписи виден пункт из шаблона", pg.includes(frozenClause));
  r = await fetch(`${API}/contract/${made.contractPublicId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "QA Тестов", agreed: true }) });
  check("договор подписан", r.status === 200, `${r.status} ${await r.text()}`.slice(0, 120));
  r = await fetch(`${API}/contract/template`, { method: "POST", headers: H, body: JSON.stringify({ body: mine, note: "тест: шаблон изменён после подписи", language: "ru" }) });
  pg = await (await fetch(`${SITE}/contract/${made.contractPublicId}?lang=ru`)).text();
  check("после правки шаблона подписанный текст прежний", pg.includes(frozenClause));
  check("и в нём нет меток", !/\{[а-яё_]+\}/i.test(stripScripts(pg)));
  const pgKk = await (await fetch(`${SITE}/contract/${made.contractPublicId}?lang=kk`)).text();
  check("казахский снимок тоже заморожен и без меток", /Орындаушы/.test(pgKk) && !/\{[а-яё_]+\}/i.test(stripScripts(pgKk)));
}

// 6. Возвращаем QA типовую заготовку как действующую версию
r = await fetch(`${API}/contract/template`, { method: "POST", headers: H, body: JSON.stringify({ body: starter.body, note: "тест: вернул типовой", language: "ru" }) });
check("вернули типовой", r.status === 200);

console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
