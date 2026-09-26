// Защита договора: метки на месте, обязательные пункты не выпали.
import { checkTemplate, fillTemplate, explainCheck } from "../src/lib/contract-template.ts";
let ok = 0, fail = 0; const check = (n, c, x = "") => { if (c) { ok++; console.log("✅", n); } else { fail++; console.log("❌", n, x); } };

const good = "Договор {номер} от {дата}. {исполнитель} и {клиент}, объект {адрес}. Сумма {сумма} ({сумма_прописью}). {таблица_работ}";
check("правильный шаблон проходит", checkTemplate(good).ok);

const noSum = "Договор. {исполнитель} и {клиент}, объект {адрес}. {таблица_работ}";
const r1 = checkTemplate(noSum);
check("пропажу суммы ловим", !r1.ok && r1.missing.some((m) => m.key === "сумма"), JSON.stringify(r1.missing));
check("объясняем по-человечески", (explainCheck(r1) ?? "").includes("сумма договора"), explainCheck(r1));
check("объясняем по-казахски", (explainCheck(r1, "kk") ?? "").includes("жарамсыз"), explainCheck(r1, "kk"));

const weird = good + " {выдуманное_поле}";
const r2 = checkTemplate(weird);
check("выдуманную метку ловим", !r2.ok && r2.unknown.includes("выдуманное_поле"), JSON.stringify(r2.unknown));

check("подстановка работает", fillTemplate("Заказчик {клиент}, сумма {сумма}", { "клиент": "Асхат", "сумма": "120 000 ₸" }) === "Заказчик Асхат, сумма 120 000 ₸");
check("неизвестная метка остаётся как есть", fillTemplate("{неизвестно}", {}) === "{неизвестно}");
check("пробелы и регистр внутри метки не мешают", fillTemplate("{ Клиент }", { "клиент": "Асхат" }) === "Асхат");

console.log(`\n${ok} ok, ${fail} fail`); process.exit(fail ? 1 : 0);
