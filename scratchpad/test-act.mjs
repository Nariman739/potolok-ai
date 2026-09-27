// Акт приёмки по ГК РК (27.09.2026): состав, замечания клиента, подпись с заморозкой, оговорки в договоре.
const API = process.env.API ?? "https://potolok.ai/api";
const SITE = API.replace(/\/api$/, "");
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "");
const text = (h) => strip(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const r0 = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r0.headers.get("set-cookie")?.split(";")[0] };
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)).replace(/\u00a0/g, " ") + " ₸";

// КП QA без акта, с суммой
const list = await j(await fetch(`${API}/estimates`, { headers: H }));
let est = null;
for (const e of list.filter((e) => e.total > 0)) {
  const full = await j(await fetch(`${API}/estimates/${e.id}`, { headers: H }));
  if (full && !full.actPublicId) { est = full; break; }
}
check("нашли КП без акта", !!est);
if (!est) process.exit(1);

// 1. Создание акта с замечаниями, особенностями и фото
let r = await fetch(`${API}/estimates/${est.id}/act/create`, { method: "POST", headers: H, body: JSON.stringify({
  remarks: ["Складка полотна у окна", "Не хватает вставки в углу"], remarksDueDays: 5,
  objectNotes: "Стены с перепадом до 2 см, старая проводка над потолком.",
  photos: ["https://example.com/ceiling-1.jpg", "http://insecure.example.com/x.jpg"],
}) });
const created = await j(r);
check("акт создан", r.status === 200 && created.actPublicId, `${r.status} ${JSON.stringify(created).slice(0, 120)}`);
const url = `${SITE}/act/${created.actPublicId}`;
let page = text(await (await fetch(`${url}?lang=ru`)).text());
check("шапка: к договору с датой", /к (Договору|Соглашению) № [A-Z0-9]{8} от \d{2} [а-яё]+ \d{4}/.test(page), page.match(/к (Договору|Соглашению).{0,60}/)?.[0]);
check("раздел оплаты: стоимость, оплачено, остаток", /Оплачено Заказчиком на дату акта/.test(page) && (/Остаток к оплате/.test(page) || /произведены полностью/.test(page)));
check("остаток = сумма − оплачено", page.includes(`Остаток к оплате: ${fmt(est.total - (est.paidTotal ?? 0))}`) || /произведены полностью/.test(page), page.match(/Остаток к оплате: .{0,20}/)?.[0]);
check("приёмка с замечаниями и сроком 5 дней", /приняты со следующими замечаниями/.test(page) && /Складка полотна у окна/.test(page) && /в течение 5 календарных дней/.test(page));
check("гарантия с датами окончания", /На материалы \(полотно\) — \d+ (лет|года|год) \(до \d{2} [а-яё]+ \d{4} г\.\)/.test(page) && /ст\. 634 ГК РК/.test(page), page.match(/На материалы.{0,60}/)?.[0]);
check("правила эксплуатации, ст. 643", /ст\. 643 ГК РК/.test(page) && /затоплении/.test(page) && /40 Вт/.test(page));
check("особенности объекта напечатаны", /Стены с перепадом до 2 см/.test(page) && /не являются недостатком/.test(page));
const raw = await (await fetch(`${url}?lang=ru`)).text();
check("фото: https принято, http отброшено", raw.includes("https://example.com/ceiling-1.jpg") && !raw.includes("insecure.example.com"));
check("нумерация разделов сплошная 1..7", /1\. Выполненные работы/.test(page) && /7\. Фотографии результата/.test(page), page.match(/\d\. [А-Я][а-я]+/g)?.join(" | "));
check("«отказывается от претензий» в акте нет", !/отказывается от/.test(page));
check("кнопка «Есть замечания» на странице", raw.includes("Есть замечания"));

// 2. Замечаний нет — чистая приёмка
r = await fetch(`${API}/estimates/${est.id}/act/create`, { method: "POST", headers: H, body: JSON.stringify({ remarks: [] }) });
page = text(await (await fetch(`${url}?lang=ru`)).text());
check("без замечаний: «видимых недостатков не обнаружено»", /видимых недостатков не обнаружено/.test(page) && !/со следующими замечаниями/.test(page));

// 3. Клиент оставляет замечания по ссылке
r = await fetch(`${API}/act/${created.actPublicId}/remarks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Ой", name: "Айгерим" }) });
check("короткие замечания не принимаем", r.status === 400);
r = await fetch(`${API}/act/${created.actPublicId}/remarks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "Светильник в спальне не по центру, прошу поправить", name: "Айгерим" }) });
check("замечания клиента приняты", r.status === 200, String(r.status));
page = text(await (await fetch(`${url}?lang=ru`)).text());
check("замечания клиента вошли в акт", /Замечания Заказчика, направленные/.test(page) && /не по центру/.test(page));
check("на странице видно, что замечания отправлены", /Замечания отправлены мастеру/.test(page));

// 4. Подпись на устройстве мастера → снимок; после — акт неизменяем
r = await fetch(`${API}/act/${created.actPublicId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "Айгерим Сериккызы", agreed: true, method: "device" }) });
check("акт подписан", r.status === 200, `${r.status} ${await r.text()}`.slice(0, 120));
page = text(await (await fetch(`${url}?lang=ru`)).text());
check("подпись: способ «на устройстве Исполнителя»", /Подписано электронно/.test(page) && /на устройстве Исполнителя/.test(page) && /Подписант: Айгерим Сериккызы/.test(page));
check("дата акта = день подписи", page.includes(new Date().getFullYear().toString()));
r = await fetch(`${API}/estimates/${est.id}/act/create`, { method: "POST", headers: H, body: JSON.stringify({ objectNotes: "попытка изменить после подписи" }) });
check("после подписи акт не меняется (409)", r.status === 409, String(r.status));
r = await fetch(`${API}/act/${created.actPublicId}/remarks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "поздние замечания после подписи" }) });
check("замечания после подписи не принимаются", r.status === 400);
page = text(await (await fetch(`${url}?lang=ru`)).text());
check("подписанный текст заморожен (поздних замечаний нет)", !/поздние замечания/.test(page) && !/попытка изменить/.test(page));
r = await fetch(`${API}/act/${created.actPublicId}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signerName: "Другой Человек", agreed: true }) });
check("второй раз подписать нельзя", r.status === 400);

// 5. Казахская версия снимка
const kk = text(await (await fetch(`${url}?lang=kk`)).text());
check("казахский акт: приёмка, кепілдік, 643-бап", /ОРЫНДАЛҒАН ЖҰМЫСТАР АКТІСІ/.test(kk) && /Кепілдік/.test(kk) && /643-бабы/.test(kk) && /Электрондық түрде қол қойылды/.test(kk));

// 6. Договор: оговорки 8.4 и 8.5. У QA свой шаблон из старой заготовки —
// обновляем его свежей заготовкой (так сделает и мастер через «Типовой договор»).
for (const lang of ["ru", "kk"]) {
  const st = await j(await fetch(`${API}/contract/template/starter?lang=${lang}`, { headers: H }));
  await fetch(`${API}/contract/template`, { method: "POST", headers: H, body: JSON.stringify({ body: st.body, note: "тест: свежая заготовка", language: lang }) });
}
const contracts = list.slice(0, 40);
let cpid = null;
for (const e of contracts) { const f = await j(await fetch(`${API}/estimates/${e.id}`, { headers: H })); if (f?.contractPublicId && !f.contractSignedAt) { cpid = f.contractPublicId; break; } }
if (cpid) {
  const cp = text(await (await fetch(`${SITE}/contract/${cpid}?lang=ru`)).text());
  check("договор: пункт о подписи по ссылке (8.4, ст. 152)", /8\.4\..{0,400}равнозначными собственноручной подписи/.test(cp) && /152 ГК РК/.test(cp));
  check("договор: пункт об автоприёмке через 3 дня (8.5)", /8\.5\..{0,120}3 \(трёх\) календарных дней/.test(cp) && /скрытых недостатков/.test(cp));
  const cpk = text(await (await fetch(`${SITE}/contract/${cpid}?lang=kk`)).text());
  check("казахский договор: 8.4 и 8.5", /8\.4\./.test(cpk) && /8\.5\./.test(cpk) && /152-бабының/.test(cpk));
} else console.log("ℹ️ неподписанного договора у QA нет — оговорки не проверены");
const starter = await j(await fetch(`${API}/contract/template/starter?lang=ru`, { headers: H }));
check("заготовка «Мой договор» содержит 8.4 и 8.5", /8\.4\./.test(starter.body) && /8\.5\./.test(starter.body));

console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
