const API = "https://potolok.ai/api";
const j = async (r) => JSON.parse(await r.text());
const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const rooms = [
  { name: "Зал", walls: [500, 400, 500, 400], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 20, perimeter: 18, elements: [] },
  { name: "Спальня", walls: [400, 300, 400, 300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 12, perimeter: 14, elements: [] },
  { name: "Кухня", walls: [300, 300, 300, 300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 9, perimeter: 12, elements: [] },
];
const items = (p, s, a) => [
  { itemCode: "canvas_320", itemName: "Полотно матовое 320см", quantity: a, unit: "м²", unitPrice: 2000, total: a * 2000 },
  { itemCode: "profile_plastic", itemName: "Пластиковый профиль", quantity: p, unit: "м.п.", unitPrice: 500, total: p * 500 },
  { itemCode: "insert", itemName: "Вставка", quantity: p, unit: "м.п.", unitPrice: 1000, total: p * 1000 },
  { itemCode: "spot_ours", itemName: "Софиты GX53 с установкой", quantity: s, unit: "шт.", unitPrice: 5000, total: s * 5000 },
  { itemCode: "corner_plastic", itemName: "Угол пластик", quantity: 4, unit: "шт.", unitPrice: 1000, total: 4000 },
  { itemCode: "install_canvas", itemName: "Монтаж полотна", quantity: a, unit: "м²", unitPrice: 800, total: a * 800 },
];
const rr = [[18,6,20],[14,4,12],[12,3,9]].map(([p,s,a],i) => ({ roomName: rooms[i].name, area: a, perimeter: p, items: items(p,s,a), subtotal: 1, subtotalAfterHeight: 1 }));
const calc = { totalArea: 41, totalPerimeter: 44, total: 412000, roomResults: rr, extraItems: [{ itemCode: "podshtornik_ldsp", itemName: "Подшторник ЛДСП", quantity: 3.5, unit: "м.п.", unitPrice: 5500, total: 19250 }] };
const m = await j(await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Взять на объект", status: "saved", clientName: "QA Гүлмира", rooms }) }));
const e = await j(await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ fromMeasurementId: m.id, roomsData: rooms.map((x, i) => ({ id: String(i), ...x, angles: [0,0,0,0] })), calculationData: calc, totalArea: 41 }) }));
const card = await j(await fetch(`${API}/objects/${m.id}`, { headers: H }));
const wo = await j(await fetch(`${API}/objects/${m.id}/workshop`, { method: "POST", headers: H, body: JSON.stringify({ roomIds: [card.rooms[0].id, card.rooms[2].id] }) }));
console.log("object", m.id, "estimate", e.id, "order", wo.id);
