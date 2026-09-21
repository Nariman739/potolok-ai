const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const tail = String(Date.now()).slice(-6);
const calc = { totalArea: 15, totalPerimeter: 16, total: 100000, roomResults: [{ roomName: "Зал", heightMultiplied: true, items: [{ itemName: "Полотно", quantity: 10, unit: "м²", unitPrice: 5000, total: 50000 }], subtotal: 50000, subtotalAfterHeight: 75000, installerItems: [{ itemName: "Монтаж", quantity: 10, unitPrice: 240, total: 2400 }], installerSubtotal: 2400 }], extraItems: [{ itemName: "Доп", quantity: 1, unit: "шт", unitPrice: 25000, total: 25000, installerPrice: 7000 }] };
// авто-объект из КП: типы стен и варианты не теряются; коэффициент высоты 1.5 сохраняется
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [{ id: "a", name: "Зал", walls: [523, 287, 523, 287], angles: [0,0,0,0], area: 15, perimeter: 16.2, elements: [], wallProfiles: { 0: "subcurtain" }, variantOverrides: { canvas: "v1" } }], calculationData: calc, totalArea: 15, clientAddress: "QA Фиксы " + tail }) });
const est = await j(r);
check("КП создано, объект создан сам", r.status === 200 && !!est.measurementObjectId, JSON.stringify(est).slice(0, 120));
check("коэффициент высоты 1.5 не превратился в 1.3 (итог 100 000)", Math.round(est.total) === 100000, est.total);
const m = await j(await fetch(`${API}/measurements/${est.measurementObjectId}`, { headers: H }));
const room = (m.rooms ?? m.measurement?.rooms ?? [])[0];
check("в комнате авто-объекта сохранён подшторник на стене 1", room?.wallProfiles?.["0"] === "subcurtain", JSON.stringify(room?.wallProfiles));
check("и выбранный вариант полотна", room?.variantOverrides?.canvas === "v1", JSON.stringify(room?.variantOverrides));
// публичная страница: нет цен монтажнику, бот не ставит VIEWED
const BASE = API.replace(/\/api$/, "");
const botPage = await (await fetch(`${BASE}/kp/${est.publicId}`, { headers: { "User-Agent": "WhatsApp/2.23.20 A" } })).text();
check("в HTML публичного КП нет installerItems/installerPrice", !/installerItems|installerSubtotal|installerPrice/.test(botPage));
await new Promise((res) => setTimeout(res, 1500));
let e2 = await j(await fetch(`${API}/estimates/${est.id}`, { headers: H }));
check("предпросмотр ссылки роботом не ставит «клиент открыл»", (e2.status ?? e2.estimate?.status) === "DRAFT", e2.status ?? e2.estimate?.status);
await fetch(`${BASE}/kp/${est.publicId}`, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" } }).then((x) => x.text());
await new Promise((res) => setTimeout(res, 2000));
e2 = await j(await fetch(`${API}/estimates/${est.id}`, { headers: H }));
check("живой клиент — ставит VIEWED", (e2.status ?? e2.estimate?.status) === "VIEWED", e2.status ?? e2.estimate?.status);
// копия КП остаётся у объекта
const dup = await j(await fetch(`${API}/estimates/${est.id}/duplicate`, { method: "POST", headers: H }));
const dupFull = await j(await fetch(`${API}/estimates/${dup.id}`, { headers: H }));
check("копия КП привязана к тому же объекту", (dupFull.measurementObjectId ?? dupFull.estimate?.measurementObjectId) === est.measurementObjectId, JSON.stringify(dupFull).slice(0, 140));
// старое удаление замера: КП не пропадает из виду — всплывает строкой в ленте
await fetch(`${API}/measurements/${est.measurementObjectId}`, { method: "DELETE", headers: H });
const feed = await j(await fetch(`${API}/objects`, { headers: H }));
check("после DELETE /measurements КП видно в ленте отдельной строкой", (feed.objects ?? feed).some((x) => x.kind === "estimate" && x.id === est.id), "");
// прайс: отрицательная и гигантская цена не проходят
const prices = await j(await fetch(`${API}/prices`, { headers: H }));
const code = (prices.items ?? prices.prices ?? prices)[0]?.itemCode ?? (prices.items ?? prices.prices ?? prices)[0]?.code;
if (code) {
  r = await fetch(`${API}/prices/${code}`, { method: "PUT", headers: H, body: JSON.stringify({ price: -500 }) });
  if (r.status === 405) r = await fetch(`${API}/prices/${code}`, { method: "PATCH", headers: H, body: JSON.stringify({ price: -500 }) });
  check("цена −500 отклонена", r.status === 400, r.status);
} else check("нашёл позицию прайса для проверки", false, JSON.stringify(prices).slice(0, 120));
// уборка
for (const id of [est.id, dup.id ?? dup.estimate?.id]) if (id) await fetch(`${API}/estimates/${id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
