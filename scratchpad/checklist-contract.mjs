// Чек-лист «что захочет мастер или клиент от договора» — прогон через помощника и печать (26.09.2026).
const API = process.env.API ?? "https://potolok.ai/api";
const SITE = API.replace(/\/api$/, "");
const stripScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/g, "");
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };
const r0 = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+77000000077", password: "qa12345" }) });
const H = { "Content-Type": "application/json", Cookie: r0.headers.get("set-cookie")?.split(";")[0] };
const text = (html) => stripScripts(html).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)).replace(/\u00a0/g, " ") + " ₸";
const rewrite = async (body, ask, language = "ru") => j(await fetch(`${API}/contract/rewrite`, { method: "POST", headers: H, body: JSON.stringify({ body, ask, language }) }));
const saveTpl = async (body, note, language = "ru") => fetch(`${API}/contract/template`, { method: "POST", headers: H, body: JSON.stringify({ body, note, language }) });
const estimates = await j(await fetch(`${API}/estimates`, { headers: H }));
const freshEstimate = async () => {
  for (const e of estimates.filter((e) => e.total > 0)) {
    const full = await j(await fetch(`${API}/estimates/${e.id}`, { headers: H }));
    if (full && !full.contractPublicId) { estimates.splice(estimates.indexOf(e), 1); return full; }
  }
  return null;
};
const printFor = async (est) => {
  const c = await j(await fetch(`${API}/estimates/${est.id}/contract/create`, { method: "POST", headers: H, body: "{}" }));
  const page = await (await fetch(`${SITE}/contract/${c.contractPublicId}?lang=ru`)).text();
  return text(stripScripts(page));
};

const starter = (await j(await fetch(`${API}/contract/template/starter?lang=ru`, { headers: H }))).body;

// 1. Мастер: «предоплата в три этапа»
console.log("\n— 1. Три этапа оплаты");
let p = await rewrite(starter, "оплата в три этапа: 30% предоплата до начала работ, 40% после доставки полотна, 30% после монтажа");
// Последний этап помощник вправе записать меткой {остаток} — печатается то же.
const stageLines = p.body.split("</p>").filter((l) => /\{\s*(предоплата|остаток)\s*\}/i.test(l)).map((l) => text(l).trim());
check("три строки этапов с метками сумм", stageLines.length === 3, stageLines.join(" | ").slice(0, 300));
check("в строках проценты 30/40/30", /30\s*%/.test(stageLines[0] ?? "") && /40\s*%/.test(stageLines[1] ?? "") && /30\s*%/.test(stageLines[2] ?? ""), stageLines.map((l) => l.match(/\d+\s*%/)?.[0]).join(","));
check("ответ остался HTML-документом", /^<!DOCTYPE html>/i.test(p.body.trim()) && /<table>/.test(p.body) && /<\/html>\s*$/.test(p.body.trim()), p.body.slice(0, 60));
check("метки целы", p.check?.ok === true, JSON.stringify(p.check));
let r = await saveTpl(p.body, "чек-лист: три этапа");
check("сохранилось", r.status === 200, String(r.status));
let est = await freshEstimate();
if (est) {
  const pg = await printFor(est);
  const a = fmt(est.total * 0.3), b = fmt(est.total * 0.4);
  check("печать: 30% и 40% посчитаны от суммы", pg.includes(a) && pg.includes(b), `ждал ${a} и ${b}; есть: ${pg.match(/\d[\d ]{2,} ₸/g)?.slice(0, 6).join(" | ")}`);
  check("печать: третий этап 30% (сумма сходится)", (pg.match(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length >= 2, pg.match(/2\.2\..{0,260}/)?.[0]);
}

// 2. Мастер: «гарантия 15 лет на полотно и 3 года на монтаж» — числами, метки уходят
console.log("\n— 2. Гарантии числами");
p = await rewrite(starter, "гарантия на полотно 15 лет, на монтаж 3 года");
check("15 лет и 3 года в тексте", /15\s*лет/.test(p.body) && /3\s*года/.test(p.body), text(p.body).match(/.{0,50}(15 лет|3 года).{0,30}/g)?.join(" || "));
check("меток гарантии больше нет", !/\{гарантия_/i.test(p.body));
check("остальные метки целы", p.check?.ok === true, JSON.stringify(p.check));

// 3. Мастер: «убери пункт» — исключения из гарантии
console.log("\n— 3. Убрать пункт");
p = await rewrite(starter, "убери пункт 4.2 про то, на что гарантия не распространяется");
check("про затопление больше нет", !/затоплен/i.test(p.body), text(p.body).match(/.{0,60}затоплен.{0,40}/)?.[0]);
check("пункт 4.3 стал 4.2 (перенумерация)", /4\.2\./.test(p.body) && !/4\.3\./.test(p.body), text(p.body).match(/4\.\d\.[^.]{0,40}/g)?.join(" | "));
check("метки целы", p.check?.ok === true, JSON.stringify(p.check));

// 4. Мастер: «срок 5 рабочих дней»
console.log("\n— 4. Срок числом");
p = await rewrite(starter, "срок выполнения работ — 5 рабочих дней");
check("5 рабочих дней в тексте, метка {срок} ушла", /5\s*рабочих дн/.test(p.body) && !/\{срок\}/.test(p.body), text(p.body).match(/3\.2\..{0,80}/)?.[0]);
check("дата начала осталась меткой", /\{дата_начала\}/.test(p.body));

// 5. Мастер: «предоплата фиксированной суммой» — что напечатается
console.log("\n— 5. Предоплата фиксированной суммой");
p = await rewrite(starter, "предоплата 50 000 тенге, остальное после подписания акта");
const lines5 = text(p.body).match(/2\.2\..{0,300}/)?.[0];
console.log("   текст:", lines5);
check("50 000 в тексте", /50\s?000/.test(p.body));
check("для остатка стоит {остаток}", /\{остаток\}/i.test(p.body), lines5);
r = await saveTpl(p.body, "чек-лист: фикс предоплата");
est = await freshEstimate();
if (est && r.status === 200) {
  const pg = await printFor(est);
  const rest = fmt(est.total - 50000);
  const printed = pg.match(/2\.2\..{0,300}/)?.[0];
  console.log("   печать:", printed);
  check("остаток напечатан верно (сумма − 50 000)", pg.includes(rest), `ждал ${rest}`);
}

// 6. Мастер-казах: правка по-казахски на казахском шаблоне
console.log("\n— 6. Казахский");
const starterKk = (await j(await fetch(`${API}/contract/template/starter?lang=kk`, { headers: H }))).body;
p = await rewrite(starterKk, "алдын ала төлем 30%, қалғаны монтаждан кейін", "kk");
check("текст остался казахским", /Орындаушы/.test(p.body) && !/Исполнитель обязуется/.test(p.body));
check("30% появились", /30\s*%/.test(p.body), text(p.body).match(/2\.2\..{0,200}/)?.[0]);
check("метки целы", p.check?.ok === true, JSON.stringify(p.check));

// 7. Клиент: договор без имени/адреса — не пустые метки, а прочерки
console.log("\n— 7. Пустые данные клиента");
r = await saveTpl(starter, "чек-лист: типовой");
est = await freshEstimate();
if (est) {
  const pg = await printFor(est);
  check("нет фигурных скобок в печати", !/\{[а-яё_]+\}/i.test(pg), pg.match(/\{[а-яё_]+\}/gi)?.join(" "));
  check("подпись клиента: ФИО и телефон подставлены или прочерки", /ФИО: .{3,}/.test(pg) && /Тел: .{3,}/.test(pg), pg.match(/ФИО: .{0,30}/)?.[0]);
}

console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
