// Этап 3: компания. QA (+77000000077) добавляет QA2 (+77000000078) по номеру →
// QA2 видит объекты и прайс компании QA; удаление возвращает QA2 в свою компанию.
const API = process.env.API ?? "http://localhost:3000/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
// QA2 — регистрируем, если нет
let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000078", password: "qa12345", firstName: "QA Два" }) });
console.log("register QA2:", r.status);
const H1 = await login("+77000000077"), H2 = await login("+77000000078");

let c1 = await j(await fetch(`${API}/company`, { headers: H1 }));
check("у QA есть компания, он владелец, один участник", c1.companyId && c1.isOwner && c1.isTeam === false && c1.members.length === 1, JSON.stringify(c1).slice(0, 160));
let c2 = await j(await fetch(`${API}/company`, { headers: H2 }));
check("у QA2 своя компания", c2.companyId && c2.companyId !== c1.companyId && c2.isOwner);

// объект у QA
r = await fetch(`${API}/measurements`, { method: "POST", headers: H1, body: JSON.stringify({ address: "QA Бригада, Абая 1", status: "saved", clientName: "QA Бригадный", rooms: [{ name: "Зал", walls: [400,300,400,300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 12, perimeter: 14, elements: [] }] }) });
const m = await j(r);
let feed2 = await j(await fetch(`${API}/objects`, { headers: H2 }));
check("QA2 до приглашения объект QA не видит", !feed2.some((x) => x.id === m.id));

// приглашение по номеру
r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ name: "Второй", phone: "8 700 000 00 78", defaultFee: 60000 }) });
const inv = await j(r);
check("QA2 привязан по номеру (8 → +7)", r.status === 200 && inv.linked === true, JSON.stringify(inv).slice(0, 150));
c1 = await j(await fetch(`${API}/company`, { headers: H1 }));
check("у QA теперь команда из двух", c1.isTeam === true && c1.members.length === 2);
c2 = await j(await fetch(`${API}/company`, { headers: H2 }));
check("QA2 работает в компании QA (без своих объектов — переключился сам)", c2.companyId === c1.companyId && c2.isOwner === false, JSON.stringify(c2).slice(0, 120));
feed2 = await j(await fetch(`${API}/objects`, { headers: H2 }));
check("QA2 видит объект QA в ленте", feed2.some((x) => x.id === m.id));
const card2 = await j(await fetch(`${API}/objects/${m.id}`, { headers: H2 }));
check("QA2 открывает карточку объекта QA", card2.id === m.id);
const cl2 = await j(await fetch(`${API}/clients`, { headers: H2 }));
check("QA2 видит клиентов QA", (Array.isArray(cl2) ? cl2 : cl2.clients ?? []).some((c) => c.id === m.clientId));
const t2 = await j(await fetch(`${API}/today`, { headers: H2 }));
check("«Сегодня» у QA2 отвечает", Array.isArray(t2.toWorkshop));
// прайс общий: QA меняет цену, QA2 её видит
const p1 = await j(await fetch(`${API}/prices`, { headers: H1 }));
const p2 = await j(await fetch(`${API}/prices`, { headers: H2 }));
check("прайс у QA2 = прайс владельца", JSON.stringify(p1).length > 10 && JSON.stringify(p1) === JSON.stringify(p2), `${JSON.stringify(p1).length} vs ${JSON.stringify(p2).length}`);
// QA2 создаёт объект — QA его видит
r = await fetch(`${API}/measurements`, { method: "POST", headers: H2, body: JSON.stringify({ address: "QA От второго", status: "saved", rooms: [{ name: "Кухня", walls: [300,300,300,300], normalCorners: [true,true,true,true], angles: [90,90,90,90], area: 9, perimeter: 12, elements: [] }] }) });
const m2 = await j(r);
const feed1 = await j(await fetch(`${API}/objects`, { headers: H1 }));
check("QA видит объект, созданный QA2", feed1.some((x) => x.id === m2.id));
// дубль по телефону → восстановление, не второй участник
r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ phone: "+77000000078" }) });
check("повторное добавление того же номера не плодит участников", (await j(r)).restored === true);
// свой номер
r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ phone: "+77000000077" }) });
check("свой номер → 400", r.status === 400);
// человек без приложения
r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ name: "Ерлан монтажник", defaultFee: 50000 }) });
const erlan = await j(r);
check("человек без телефона и приложения добавлен", r.status === 200 && erlan.member?.masterId === null && erlan.member?.defaultFee === 50000);
// PATCH
r = await fetch(`${API}/company/members/${erlan.member.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ defaultFee: 55000 }) });
check("правка суммы монтажнику", (await j(r)).defaultFee === 55000);
// удаление QA2 → возвращается в свою компанию
const memberId = c1.members.find((x) => x.masterId && !x.isMe)?.id;
r = await fetch(`${API}/company/members/${memberId}`, { method: "DELETE", headers: H1 });
check("удаление участника", r.status === 200);
c2 = await j(await fetch(`${API}/company`, { headers: H2 }));
check("QA2 снова в своей компании", c2.isOwner === true && c2.companyId !== c1.companyId);
feed2 = await j(await fetch(`${API}/objects`, { headers: H2 }));
check("QA2 больше не видит объекты QA", !feed2.some((x) => x.id === m.id));
// владельца удалить нельзя
const ownerId = c1.members.find((x) => x.isMe)?.id;
r = await fetch(`${API}/company/members/${ownerId}`, { method: "DELETE", headers: H1 });
check("владельца убрать нельзя → 400", r.status === 400);
// уборка
await fetch(`${API}/company/members/${erlan.member.id}`, { method: "DELETE", headers: H1 });
await fetch(`${API}/measurements/${m.id}`, { method: "DELETE", headers: H1 });
await fetch(`${API}/measurements/${m2.id}`, { method: "DELETE", headers: H2 }).catch(() => {});
console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
