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
  calculationData: calc, totalArea: 25, clientName: "QA Гульмира" }) });
const est = await j(r);
check("КП без fromMeasurementId привязалось к существующему объекту, а не создало новый", est.measurementObjectId === m.id, `${est.measurementObjectId} vs ${m.id}`);
// другие стены → новый объект
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: [
  { id: "a", name: "Зал", walls: [400, 400, 400, 400], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 16, perimeter: 16, elements: [] }],
  calculationData: calc, totalArea: 16, clientName: "Другой" }) });
const est2 = await j(r);
check("другие комнаты → свой объект", est2.measurementObjectId && est2.measurementObjectId !== m.id);
// те же стены, но другой адрес и клиент → это другой объект (21.09: КП прилипало к чужому)
const roomsSame = [
  { id: "a", name: "Зал", walls: walls[0], angles: [0,0,0,0], bulges: [0,0,0,0], cornerRadii: [0,0,0,0], area: 19.3, perimeter: 17.78, elements: [] },
  { id: "b", name: "Коридор", walls: walls[1], angles: [0,0,0,0,0,0], bulges: [], cornerRadii: [], area: 5.7, perimeter: 11, elements: [] }];
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: roomsSame,
  calculationData: calc, totalArea: 25, clientName: "QA Другой клиент", clientPhone: "+77010000021", clientAddress: "QA Full 21" }) });
const est3 = await j(r);
check("те же стены, другой адрес и клиент → свой объект", est3.measurementObjectId && est3.measurementObjectId !== m.id, `${est3.measurementObjectId}`);
const o3 = await j(await fetch(`${API}/objects/${est3.measurementObjectId}`, { headers: H }));
check("адрес из КП попал в новый объект", (o3.address ?? o3.object?.address) === "QA Full 21", JSON.stringify(o3).slice(0, 160));
// комнаты с serverId → точная привязка к объекту этих комнат, даже с другим именем клиента
const mFull = await j(await fetch(`${API}/measurements/${m.id}`, { headers: H }));
const srvRooms = (mFull.rooms ?? mFull.measurement?.rooms ?? []);
r = await fetch(`${API}/estimates`, { method: "POST", headers: H, body: JSON.stringify({ roomsData: roomsSame.map((x, i) => ({ ...x, serverId: srvRooms[i]?.id })),
  calculationData: calc, totalArea: 25, clientName: "QA Совсем другое имя" }) });
const est4 = await j(r);
check("комнаты с serverId → КП у объекта этих комнат", est4.measurementObjectId === m.id, `${est4.measurementObjectId} vs ${m.id} rooms=${srvRooms.length}`);
for (const e of [est3, est4]) if (e?.id) await fetch(`${API}/estimates/${e.id}`, { method: "DELETE", headers: H });
if (est3.measurementObjectId && est3.measurementObjectId !== m.id) await fetch(`${API}/measurements/${est3.measurementObjectId}`, { method: "DELETE", headers: H });
for (const e of [est, est2]) await fetch(`${API}/estimates/${e.id}`, { method: "DELETE", headers: H });
for (const id of [m.id, est2.measurementObjectId]) if (id) await fetch(`${API}/measurements/${id}`, { method: "DELETE", headers: H });
// уборка QA-клиентов теста, чтобы не копились в списке
const cl = await j(await fetch(`${API}/clients`, { headers: H }));
for (const c of (cl.clients ?? cl ?? [])) if (["QA Гульмира", "Другой", "QA Другой клиент", "QA Совсем другое имя"].includes(c.name)) await fetch(`${API}/clients/${c.id}`, { method: "DELETE", headers: H });
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
