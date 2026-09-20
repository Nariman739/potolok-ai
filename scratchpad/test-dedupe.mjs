const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
let r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] };
const walls = [[512, 377, 512, 377], [300, 250, 120, 100, 180, 150]];
r = await fetch(`${API}/measurements`, { method: "POST", headers: H, body: JSON.stringify({ address: "QA Дедуп, Толе би 26", status: "saved", clientName: "QA Гульмира",
  rooms: [{ name: "Зал", walls: walls[0], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 19.3, perimeter: 17.78, elements: [] },
          { name: "Коридор", walls: walls[1], normalCorners: [true,true,true,false,true,true], angles: [90,90,90,-90,90,90], area: 5.7, perimeter: 11, elements: [] }] }) });
const m = await j(r);
const calc = { totalArea: 25, totalPerimeter: 28.78, total: 200000, roomResults: [{ roomName: "Зал", items: [{ itemName: "Полотно", quantity: 25, unit: "м²", unitPrice: 8000, total: 200000 }], subtotal: 200000, subtotalAfterHeight: 200000 }], extraItems: [] };
// КП БЕЗ fromMeasurementId, комнаты те же (как после перезапуска приложения)
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [
  { id: "a", name: "Зал", walls: walls[0], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 19.3, perimeter: 17.78, elements: [] },
  { id: "b", name: "Коридор", walls: walls[1], angles: [0,0,0,0,0,0], bulges: [], cornerRadii: [], area: 5.7, perimeter: 11, elements: [] }],
  calculationData: calc, totalArea: 25, clientName: "Гульмира" }) });
const est = await j(r);
check("КП без fromMeasurementId привязалось к существующему объекту, а не создало новый", est.measurementObjectId === m.id, `${est.measurementObjectId} vs ${m.id}`);
// другие стены → новый объект
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [
  { id: "a", name: "Зал", walls: [400, 400, 400, 400], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 16, perimeter: 16, elements: [] }],
  calculationData: calc, totalArea: 16, clientName: "Другой" }) });
const est2 = await j(r);
check("другие комнаты → свой объект", est2.measurementObjectId && est2.measurementObjectId !== m.id);
for (const e of [est, est2]) await fetch(`${API}/estimates/${e.id}`, { method: "DELETE", headers: H });
for (const id of [m.id, est2.measurementObjectId]) if (id) await fetch(`${API}/measurements/${id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
