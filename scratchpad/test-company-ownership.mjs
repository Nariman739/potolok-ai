// 24.09.2026: данные принадлежат компании, а не мастеру.
// Сотрудник ушёл из бригады → его объекты, КП, клиенты и оплаты остаются
// у владельца, а сам он их больше не видит (базу с собой не уносит).
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const room = (name) => ({ name, walls: [400, 300, 400, 300], normalCorners: [true, true, true, true], angles: [90, 90, 90, 90], area: 12, perimeter: 14, elements: [] });

const H1 = await login("+77000000077"), H2 = await login("+77000000078");
const c1 = await j(await fetch(`${API}/company`, { headers: H1 }));

// QA2 приходит в бригаду
await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ name: "Второй", phone: "+77000000078" }) });
let c2 = await j(await fetch(`${API}/company/switch`, { method: "POST", headers: H2, body: JSON.stringify({ companyId: c1.companyId }) }));
check("QA2 работает в компании QA", c2.companyId === c1.companyId, JSON.stringify(c2).slice(0, 120));

// Сотрудник делает работу: замер, КП, клиент, оплата
const mkPhone = `7700${Date.now().toString().slice(-7)}`;
let r = await fetch(`${API}/measurements`, { method: "POST", headers: H2, body: JSON.stringify({ address: "QA Владение, Сарыарка 5", status: "saved", clientName: "QA Владелец Теста", clientPhone: mkPhone, rooms: [room("Зал")] }) });
const obj = await j(r);
check("объект сотрудника создан", !!obj.id, JSON.stringify(obj).slice(0, 150));

const calc = { totalArea: 12, totalPerimeter: 14, total: 100000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 12, unit: "м²", unitPrice: 8333, total: 100000 }], subtotal: 100000, subtotalAfterHeight: 100000 }], extraItems: [] };
r = await fetch(`${API}/estimates`, { method: "POST", headers: H2, body: JSON.stringify({ fromMeasurementId: obj.id, clientName: "QA Владелец Теста", clientPhone: mkPhone, clientAddress: "QA Владение, Сарыарка 5", roomsData: [{ id: "a", ...room("Зал"), angles: [0, 0, 0, 0] }], calculationData: calc, totalArea: 12 }) });
const est = await j(r);
check("КП сотрудника создано", !!est.id, JSON.stringify(est).slice(0, 150));

r = await fetch(`${API}/objects/${obj.id}/payments`, { method: "POST", headers: H2, body: JSON.stringify({ amount: 50000, kind: "prepayment" }) });
check("оплата записана сотрудником", r.status === 200, r.status);

// Клиент общий: тот же телефон у владельца не заводит дубль
r = await fetch(`${API}/clients`, { method: "POST", headers: H1, body: JSON.stringify({ name: "QA Владелец Теста", phone: mkPhone }) });
const sameClient = await j(r);
check("владелец не плодит дубль клиента бригады", sameClient.id === obj.clientId, `${sameClient.id} vs ${obj.clientId}`);

// Убираем сотрудника
const members = (await j(await fetch(`${API}/company`, { headers: H1 }))).members ?? [];
const memberId = members.find((x) => (x.phone ?? "").endsWith("7000000078"))?.id;
r = await fetch(`${API}/company/members/${memberId}`, { method: "DELETE", headers: H1 });
check("сотрудник убран из бригады", r.status === 200, r.status);

// Главное: у владельца ничего не пропало
const feed1 = await j(await fetch(`${API}/objects`, { headers: H1 }));
check("объект ушедшего остался в ленте владельца", feed1.some((x) => x.id === obj.id));
const card = await j(await fetch(`${API}/objects/${obj.id}`, { headers: H1 }));
check("владелец открывает карточку объекта", card.id === obj.id, JSON.stringify(card).slice(0, 120));
check("КП ушедшего видно владельцу", (card.estimates ?? []).some((e) => e.id === est.id), JSON.stringify(card.estimates ?? []).slice(0, 120));
check("оплата ушедшего осталась на объекте", (card.money?.payments ?? []).some((p) => p.amount === 50000), JSON.stringify(card.money ?? {}).slice(0, 160));
const clients1 = await j(await fetch(`${API}/clients?search=${mkPhone}`, { headers: H1 }));
const list1 = Array.isArray(clients1) ? clients1 : clients1.clients ?? [];
check("клиент ушедшего остался у владельца", list1.some((c) => c.id === obj.clientId), JSON.stringify(list1).slice(0, 150));
const money1 = await j(await fetch(`${API}/money`, { headers: H1 }));
check("деньги ушедшего в отчёте владельца", (money1.prepaid ?? []).some((x) => x.id === obj.id) || (money1.owedToMe ?? []).some((x) => x.id === obj.id), JSON.stringify(money1.prepaid ?? []).slice(0, 150));

// И ушедший базу не унёс
const feed2 = await j(await fetch(`${API}/objects`, { headers: H2 }));
check("ушедший не видит объект в своей ленте", !feed2.some((x) => x.id === obj.id));
const card2 = await fetch(`${API}/objects/${obj.id}`, { headers: H2 });
check("ушедший не откроет карточку → 404", card2.status === 404, card2.status);
const clients2 = await j(await fetch(`${API}/clients?search=${mkPhone}`, { headers: H2 }));
const list2 = Array.isArray(clients2) ? clients2 : clients2.clients ?? [];
check("ушедший не видит клиента бригады", !list2.some((c) => c.id === obj.clientId), JSON.stringify(list2).slice(0, 150));

// уборка — владельцем, он теперь хозяин данных
await fetch(`${API}/estimates/${est.id}`, { method: "DELETE", headers: H1 }).catch(() => {});
await fetch(`${API}/measurements/${obj.id}`, { method: "DELETE", headers: H1 }).catch(() => {});
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
