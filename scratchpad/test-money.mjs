// Этап 4: деньги. Объект + КП → предоплата → остаток → материал → монтажнику выплачено → «закрыл».
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
r = await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Деньги, Жибек жолы 3", status: "saved", clientName: "QA Плательщик", rooms: [{ name: "Зал", walls: [500,400,500,400], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 20, perimeter: 18, elements: [] }] }) });
const m = await j(r);
const calc = { totalArea: 20, totalPerimeter: 18, total: 200000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 20, unit: "м²", unitPrice: 10000, total: 200000 }], subtotal: 200000, subtotalAfterHeight: 200000 }], extraItems: [] };
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ fromMeasurementId: m.id, clientId: m.clientId, roomsData: [{ id: "a", name: "Зал", walls: [500,400,500,400], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 20, perimeter: 18, elements: [] }], calculationData: calc, totalArea: 20 }) });
const est = await j(r);
let card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
check("карточка: цена 200000, получено 0, остаток 200000", card.money?.price === 200000 && card.money.paid === 0 && card.money.due === 200000, JSON.stringify(card.money));
check("прибыль — оценка по 40%: 200000-80000 = 120000 ≈", card.money?.profit === 120000 && card.money.profitIsEstimate === true, JSON.stringify(card.money));
// предоплата
r = await fetch(`${API}/objects/${m.id}/payments`, { method: "POST", headers: { ...H, "X-Op-Id": "pay-" + Date.now() }, body: JSON.stringify({ amount: 100000, kind: "prepayment" }) });
const p1 = await j(r);
check("предоплата записана", r.status === 200 && p1.amount === 100000, JSON.stringify(p1));
r = await fetch(`${API}/objects/${m.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: -5 }) });
check("отрицательная сумма → 400", r.status === 400);
// клиент согласовал + монтажник + материал
await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ manualStage: "installed", installerFee: 30000, materialCost: 70000 }) });
card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
check("после предоплаты: остаток 100000, этап «смонтировали» (денег не хватает → не закрыл)", card.money.due === 100000 && card.stage === "installed", `${card.money.due} ${card.stage}`);
check("прибыль точная: 200000-70000-30000 = 100000", card.money.profit === 100000 && card.money.profitIsEstimate === false, JSON.stringify(card.money));
// деньги: должны мне 100000, должен я 30000
let money = await j(await fetch(`${API}/money`, { headers: H }));
check("«должны мне» содержит объект с остатком 100000", money.owedToMe?.some((x) => x.id === m.id && x.due === 100000), JSON.stringify(money.owedToMe).slice(0, 160));
check("«должен я» содержит монтажнику 30000", money.owedByMe?.some((x) => x.id === m.id && x.fee === 30000), JSON.stringify(money.owedByMe).slice(0, 160));
check("получено за месяц ≥ 100000", money.month?.received >= 100000, JSON.stringify(money.month));
// остаток → закрыл
r = await fetch(`${API}/objects/${m.id}/payments`, { method: "POST", headers: H, body: JSON.stringify({ amount: 100000, kind: "final" }) });
check("остаток записан", r.status === 200);
card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
check("смонтировали + деньги = «закрыл»", card.stage === "closed" && card.money.settled === true, `${card.stage} settled=${card.money.settled}`);
check("история содержит оплаты", card.history.filter((h) => h.type === "PAYMENT").length === 2);
// выплата монтажнику
r = await fetch(`${API}/objects/${m.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ installerPaid: true }) });
const pp = await j(r);
check("монтажнику выплачено", pp.money?.installerPaid === true, JSON.stringify(pp.money));
money = await j(await fetch(`${API}/money`, { headers: H }));
check("«должен я» пуст по этому объекту, «должны мне» тоже", !money.owedByMe.some((x) => x.id === m.id) && !money.owedToMe.some((x) => x.id === m.id));
check("закрыт в этом месяце с прибылью", money.month.closed >= 1 && money.month.profit >= 100000, JSON.stringify(money.month));
// удаление платежа
r = await fetch(`${API}/objects/${m.id}/payments?paymentId=${p1.id}`, { method: "DELETE", headers: H });
check("платёж удалён", r.status === 200);
card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
check("после удаления предоплаты остаток 100000 и снова «смонтировали»", card.money.due === 100000 && card.stage === "installed", `${card.money.due} ${card.stage}`);
// лента: paid/due
const feed = await j(await fetch(`${API}/objects`, { headers: H }));
const row = feed.find((x) => x.id === m.id);
check("лента: paid 100000, due 100000", row?.paid === 100000 && row?.due === 100000, JSON.stringify({ paid: row?.paid, due: row?.due }));
// уборка
await fetch(`${API}/estimates/${est.id}`, { method: "DELETE", headers: H });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
