// «Мой прайс» v2 на проде: форма ответа, добавление с дублем, правка, скрытие, удаление, права участника.
// QA (+77000000077) — владелец; QA2 (+77000000078) — участник его компании на время теста.
const API = process.env.API ?? "https://potolok.ai/api";
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 200); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const login = async (phone) => { const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password: "qa12345" }) }); return { "Content-Type": "application/json", Cookie: r.headers.get("set-cookie")?.split(";")[0] }; };
const H1 = await login("+77000000077"), H2 = await login("+77000000078");
const v2 = async (h) => j(await fetch(`${API}/prices/v2`, { headers: h }));

// Форма
let book = await v2(H1);
check("v2 отдаёт items/isOwner/companyName", Array.isArray(book.items) && book.isOwner === true && typeof book.companyName === "string", JSON.stringify(book).slice(0, 120));
const byCode = Object.fromEntries(book.items.map((i) => [i.code, i]));
check("каталожные позиции материализованы (≥50, есть pk14/diffuser)", book.items.filter((i) => i.isTemplate).length >= 50 && byCode.pk14 && byCode.diffuser, book.items.filter((i) => i.isTemplate).length);
check("у каждой позиции есть роль из набора", book.items.every((i) => ["canvas","wall","point","linear","corner","extra","param","install"].includes(i.role)));
check("роли каталога верные: canvas_320=canvas, profile_floating=wall, spot_ours=point, track_magnetic=linear, pipe_bypass=extra, min_order=param, install_canvas=install",
  byCode.canvas_320?.role === "canvas" && byCode.profile_floating?.role === "wall" && byCode.spot_ours?.role === "point" && byCode.track_magnetic?.role === "linear" && byCode.pipe_bypass?.role === "extra" && byCode.min_order?.role === "param" && byCode.install_canvas?.role === "install");
check("переопределённая цена сохранилась после миграции (profile_floating=12345, isCustom)", byCode.profile_floating?.price === 12345 && byCode.profile_floating?.isCustom === true, byCode.profile_floating?.price);
check("скрытая позиция сохранилась (canvas_over)", byCode.canvas_over?.isHidden === true);
const dif = book.items.find((i) => i.name === "QA Дифузор");
check("мигрированный «Дифузор» из «Люстр»: роль extra, категория осталась chandelier (старое приложение найдёт), needsReview", dif && dif.role === "extra" && dif.category === "chandelier" && dif.needsReview === true, JSON.stringify(dif));
const shadow = book.items.find((i) => i.name === "QA Теневой Bizon");
check("мигрированный вариант профиля: wall, noInsert в wallKind", shadow && shadow.role === "wall" && shadow.wallKind?.noInsert === true, JSON.stringify(shadow?.wallKind));
check("legacy-коды не показываются", !book.items.some((i) => i.category === "legacy"));

// Добавление: дубль по имени → не плодим
let r = await fetch(`${API}/prices/v2`, { method: "POST", headers: H1, body: JSON.stringify({ name: "qa дифузор", price: 1, unit: "шт." }) });
let res = await j(r);
check("дубль по имени (без учёта регистра) не создаётся", r.status === 200 && res.duplicate === true && res.item.id === dif.id, JSON.stringify(res).slice(0, 120));
// Новая своя позиция, роль по умолчанию extra
r = await fetch(`${API}/prices/v2`, { method: "POST", headers: H1, body: JSON.stringify({ name: "QA Лестница сложная", price: 25000, unit: "шт." }) });
res = await j(r);
check("своя позиция создана с role=extra и code own:", r.status === 200 && res.duplicate === false && res.item.role === "extra" && res.item.code.startsWith("own:"), JSON.stringify(res).slice(0, 160));
const own = res.item;
// По стенам → wall
r = await fetch(`${API}/prices/v2`, { method: "POST", headers: H1, body: JSON.stringify({ name: "QA Профиль Altor", price: 11000, unit: "м.п.", role: "wall" }) });
res = await j(r);
check("позиция «по стенам» = wall, категория profile (видна старому меню стены)", r.status === 200 && res.item.role === "wall" && res.item.category === "profile", JSON.stringify(res.item).slice(0, 160));
const wallItem = res.item;
// По точкам → point/люстра
r = await fetch(`${API}/prices/v2`, { method: "POST", headers: H1, body: JSON.stringify({ name: "QA Люстра Премиум", price: 7000, unit: "шт.", role: "point", appliesTo: ["chandelier"] }) });
res = await j(r);
check("позиция «по точкам: люстра» = point/chandelier", r.status === 200 && res.item.role === "point" && res.item.category === "chandelier" && res.item.appliesTo.includes("chandelier"), JSON.stringify(res.item).slice(0, 160));
const pointItem = res.item;

// Старые ручки видят новые позиции (расчёт в старом приложении)
const legacyVariants = await j(await fetch(`${API}/prices/variants`, { headers: H1 }));
check("старый /prices/variants видит wall-позицию как category=profile", legacyVariants.some((v) => v.id === wallItem.id && v.category === "profile"));
check("старый /prices/variants видит extra-позицию как category=other", legacyVariants.some((v) => v.id === own.id && v.category === "other"));
const legacyPrices = await j(await fetch(`${API}/prices`, { headers: H1 }));
check("старый /prices отдаёт каталог с новыми кодами и бывший CustomItem", legacyPrices.some((p) => p.code === "pk14") && legacyPrices.some((p) => p.isCustomItem && p.name === "QA Демонтаж"));

// Правка
r = await fetch(`${API}/prices/v2/${own.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ price: 30000, name: "QA Лестница", unit: "м²" }) });
res = await j(r);
check("PATCH своей: цена, имя, единица", r.status === 200 && res.item.price === 30000 && res.item.name === "QA Лестница" && res.item.unit === "м²", JSON.stringify(res).slice(0, 120));
r = await fetch(`${API}/prices/v2/${byCode.canvas_320.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ price: 1700, name: "Хак" }) });
res = await j(r);
check("PATCH каталожной: цена меняется, имя — нет", r.status === 200 && res.item.price === 1700 && res.item.name === byCode.canvas_320.name, JSON.stringify(res).slice(0, 120));
r = await fetch(`${API}/prices/v2/${byCode.canvas_320.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ price: 1500 }) });
r = await fetch(`${API}/prices/v2/${dif.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ needsReview: false }) });
check("needsReview снимается", r.status === 200 && (await j(r)).item.needsReview === false);
r = await fetch(`${API}/prices/v2/${byCode.spot_ours.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ isHidden: true }) });
check("скрытие каталожной", r.status === 200 && (await j(r)).item.isHidden === true);
const lp2 = await j(await fetch(`${API}/prices`, { headers: H1 }));
check("старый /prices видит скрытие", lp2.find((p) => p.code === "spot_ours")?.isHidden === true);
await fetch(`${API}/prices/v2/${byCode.spot_ours.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ isHidden: false }) });
r = await fetch(`${API}/prices/v2/${byCode.canvas_320.id}`, { method: "PATCH", headers: H1, body: JSON.stringify({ price: 99_999_999 }) });
check("цена вне границ → 400", r.status === 400);

// Удаление
r = await fetch(`${API}/prices/v2/${byCode.canvas_320.id}`, { method: "DELETE", headers: H1 });
check("каталожную удалить нельзя → 400", r.status === 400);
r = await fetch(`${API}/prices/v2/${pointItem.id}`, { method: "DELETE", headers: H1 });
check("своя позиция удаляется (в корзину)", r.status === 200);
book = await v2(H1);
check("удалённая пропала из списка", !book.items.some((i) => i.id === pointItem.id));
r = await fetch(`${API}/prices/variants/${pointItem.id}/restore`, { method: "POST", headers: H1 });
check("восстановление из корзины старой ручкой", r.status === 200);

// Участник бригады: читает, не пишет
r = await fetch(`${API}/company`, { method: "POST", headers: H1, body: JSON.stringify({ name: "QA Два", phone: "+77000000078" }) });
r = await fetch(`${API}/company/switch`, { method: "POST", headers: H2, body: JSON.stringify({ companyId: (await j(await fetch(`${API}/company`, { headers: H1 }))).companyId }) });
check("QA2 вошёл в компанию QA", r.status === 200);
const book2 = await v2(H2);
check("участник видит прайс компании, isOwner=false", book2.isOwner === false && book2.items.some((i) => i.id === own.id));
r = await fetch(`${API}/prices/v2/${own.id}`, { method: "PATCH", headers: H2, body: JSON.stringify({ price: 1 }) });
check("участник не может менять цены → 403", r.status === 403);
r = await fetch(`${API}/prices/v2`, { method: "POST", headers: H2, body: JSON.stringify({ name: "QA чужая", price: 1, unit: "шт." }) });
check("участник не может добавлять → 403", r.status === 403);
r = await fetch(`${API}/prices`, { method: "PUT", headers: H2, body: JSON.stringify({ items: [{ itemCode: "canvas_320", price: 1 }] }) });
check("старая PUT /prices у участника → 403", r.status === 403);

// Уборка
await fetch(`${API}/company/switch`, { method: "POST", headers: H2, body: JSON.stringify({ own: true }) });
const c1 = await j(await fetch(`${API}/company`, { headers: H1 }));
for (const m of c1.members.filter((m) => m.phone === "+77000000078")) await fetch(`${API}/company/members/${m.id}`, { method: "DELETE", headers: H1 });
for (const id of [own.id, wallItem.id, pointItem.id]) await fetch(`${API}/prices/v2/${id}`, { method: "DELETE", headers: H1 });
for (const id of [own.id, wallItem.id, pointItem.id]) await fetch(`${API}/prices/variants/${id}/permanent-delete`, { method: "POST", headers: H1 });

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
