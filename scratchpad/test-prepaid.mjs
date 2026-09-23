const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const tail = String(Date.now()).slice(-6);
const room = { name: "Зал", walls: [421, 311, 421, 311], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 13.1, perimeter: 14.6, elements: [] };
const money = () => j(fetch(`${API}/money`, { headers: H }).then((x) => x));
// 1. деньги есть, КП нет
const m1 = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Аванс без КП " + tail, status: "saved", rooms: [room] }) }));
await fetch(`${API}/objects/${m1.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: 30000, kind: "prepayment" }) });
let mm = await j(await fetch(`${API}/money`, { headers: H }));
let row = (mm.prepaid ?? []).find((o) => o.id === m1.id);
check("деньги без КП → «нет цены»", row?.state === "no_price" && row.paid === 30000, JSON.stringify(row));
// 2. предоплата при живом КП
const calc = { totalArea: 13.1, totalPerimeter: 14.6, total: 100000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 13.1, unit: "м²", unitPrice: 7634, total: 100000 }], subtotal: 100000, subtotalAfterHeight: 100000 }], extraItems: [] };
const m2 = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Аванс с КП " + tail, status: "saved", rooms: [room] }) }));
await j(await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [{ id: "a", ...room, angles: [0,0,0,0] }], calculationData: calc, totalArea: 13.1, fromMeasurementId: m2.id }) }));
await fetch(`${API}/objects/${m2.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: 40000, kind: "prepayment" }) });
mm = await j(await fetch(`${API}/money`, { headers: H }));
row = (mm.prepaid ?? []).find((o) => o.id === m2.id);
check("предоплата при КП → «часть»", row?.state === "paid_part" && row.paid === 40000, JSON.stringify(row));
const price2 = row?.price ?? 0;
check("остаток по нему висит в «Должны мне»", (mm.owedToMe ?? []).some((o) => o.id === m2.id && o.due === price2 - 40000), `цена ${price2}, ищем остаток ${price2 - 40000}`);
// 3. оплачено полностью, но не закрыт
await fetch(`${API}/objects/${m2.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: price2 - 40000, kind: "final" }) });
mm = await j(await fetch(`${API}/money`, { headers: H }));
row = (mm.prepaid ?? []).find((o) => o.id === m2.id);
const card = await j(await fetch(`${API}/objects/${m2.id}`, { headers: H }));
// «Закрыл» = смонтировали И деньги получены, поэтому только по оплате объект не закрывается.
check("оплачено полностью, монтажа не было → висит как «оплачено, не закрыто»", card.stage !== "closed" && row?.state === "paid_full", `${card.stage} / ${JSON.stringify(row)}`);
await fetch(`${API}/objects/${m2.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "installed" }) });
const card2 = await j(await fetch(`${API}/objects/${m2.id}`, { headers: H }));
const mm2 = await j(await fetch(`${API}/money`, { headers: H }));
check("отметил монтаж при полной оплате → «Закрыл» и из списка ушёл", card2.stage === "closed" && !(mm2.prepaid ?? []).some((o) => o.id === m2.id), `${card2.stage}`);
// 4. закрыт вручную, но остаток не отдали
const m3 = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Закрыт с долгом " + tail, status: "saved", rooms: [room] }) }));
await j(await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [{ id: "a", ...room, angles: [0,0,0,0] }], calculationData: calc, totalArea: 13.1, fromMeasurementId: m3.id }) }));
await fetch(`${API}/objects/${m3.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: 20000, kind: "prepayment" }) });
await fetch(`${API}/objects/${m3.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "closed" }) });
mm = await j(await fetch(`${API}/money`, { headers: H }));
const debtRow = (mm.owedToMe ?? []).find((o) => o.id === m3.id);
check("закрыт с долгом → остаток всё ещё в «Должны мне»", !!debtRow && debtRow.due === debtRow.price - 20000, JSON.stringify(debtRow));
check("закрыт с долгом → не числится как «оплачено, не закрыто»", !(mm.prepaid ?? []).some((o) => o.id === m3.id), "");
for (const id of [m1.id, m2.id, m3.id]) await fetch(`${API}/objects/${id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
