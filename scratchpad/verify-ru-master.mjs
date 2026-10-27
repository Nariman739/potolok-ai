// Проверка «potolok.ai под Россию» на проде через API (27.10.2026).
// QA-аккаунт с российским номером: +79990000077 / qa12345 (регистрируется сам,
// billingNotes = QA RU). node scratchpad/verify-ru-master.mjs
const API = "https://potolok.ai/api";
const PHONE = "+79990000077", PASS = "qa12345";
const ok = (c, msg) => console.log(c ? "✅" : "❌", msg);

let res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: PHONE, password: PASS }) });
if (res.status !== 200) {
  res = await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: PHONE, password: PASS, firstName: "QA Россия", companyName: "QA RU" }) });
  console.log("регистрация:", res.status);
}
const cookie = res.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("нет сессии " + res.status + " " + (await res.text()).slice(0, 200));
const H = { "Content-Type": "application/json", Cookie: cookie };
const get = async (p) => (await fetch(`${API}${p}`, { headers: H })).json();

const me = await get("/auth/me");
ok(me.currency === "RUB", `валюта мастера: ${me.currency}`);
ok(me.billing?.currency === "RUB" && me.billing?.prices?.launchMonth === 390 && me.billing?.prices?.month === 990, `billing: ${me.billing?.currency} ${JSON.stringify(me.billing?.prices)}`);

const prices = await get("/prices");
const canvas = prices.find?.((p) => p.code === "canvas_320");
ok(canvas?.price === 450 && canvas?.defaultPrice === 450 && canvas?.isCustom === false, `прайс canvas_320: price ${canvas?.price}, default ${canvas?.defaultPrice}, isCustom ${canvas?.isCustom}`);
const v2 = await get("/prices/v2");
const shadow = v2.items?.find((i) => i.templateCode === "profile_shadow");
ok(shadow?.price === 1200 && shadow?.defaultPrice === 1200, `прайс v2 теневой: ${shadow?.price} / default ${shadow?.defaultPrice}`);

// Договор: тип ИП, чтобы были реквизиты
await fetch(`${API}/profile`, { method: "PUT", headers: H, body: JSON.stringify({ contractType: "ip", bin: "312345678901234", iin: "780101123456", legalName: "ИП Иванов", legalAddress: "г. Санкт-Петербург, ул. Ленина 1", bankName: "ПАО Сбербанк", iban: "40802810000000000001", kbe: "19", bik: "044525225", contractCity: "Санкт-Петербург" }) }).then((r) => console.log("профиль ИП:", r.status));
const starter = await get("/contract/template/starter?lang=ru");
const b = starter.body ?? "";
ok(b.includes("ГК РФ") && !b.includes("ГК РК"), `стартовый договор: ГК РФ ${b.includes("ГК РФ")}, ГК РК ${b.includes("ГК РК")}`);
ok(b.includes("{сумма_прописью}") && b.includes("{реквизиты_исполнителя}"), "метки суммы и реквизитов на месте");
const tpl = await get("/contract/template");
const iinAbout = tpl.placeholders?.find((p) => p.key === "иин_клиента")?.about;
ok(iinAbout === "ИНН или паспорт заказчика", `метка иин_клиента: «${iinAbout}»`);

// /pricing: SSR-страница под сессией
res = await fetch("https://potolok.ai/pricing", { headers: { Cookie: cookie } });
const html = await res.text();
ok(html.includes("390 ₽") || html.includes("390&nbsp;₽") || /390\s*₽/.test(html), `/pricing: цена 390 ₽ на странице (${res.status})`);
ok(html.includes("Перевод из России"), "/pricing: «Перевод из России»");
ok(!html.includes("Kaspi или карта"), "/pricing: нет «Kaspi или карта»");

// карта TipTop — отказ для RUB
res = await fetch(`${API}/payment/tiptop/create`, { method: "POST", headers: H, body: JSON.stringify({ period: "month" }) });
console.log("tiptop/create:", res.status, (await res.text()).slice(0, 110));

// заявка переводом → Telegram админу (помечена как тест)
res = await fetch(`${API}/payment/submit`, { method: "POST", headers: H, body: JSON.stringify({ method: "transfer", period: "month", comment: "ТЕСТ окна сайта (QA RU, 27.10) — НЕ активировать, можно отклонить" }) });
const sub = await res.json();
ok(res.status === 200 && sub.amount === 390, `заявка: ${res.status} сумма ${sub.amount} (id ${sub.id})`);
