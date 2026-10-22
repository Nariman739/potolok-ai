// Самопроверка модулей календаря без Telegram (17.10.2026):
//   npx tsx --env-file=.env.local scratchpad/calendar-bot-selftest.ts
// Проверяет: шифрование, state-токен, конвертацию времени, извлечение события ИИ.
import {
  encryptSecret,
  decryptSecret,
  makeOAuthState,
  verifyOAuthState,
  connectUrlForChat,
  makeConnectToken,
  verifyConnectToken,
  googleAuthUrl,
  isGoogleConfigured,
} from "../src/lib/google-calendar";
import { extractEvent, formatDraftCard, zonedLocalToDate, formatLocalIso, normalizeAmount } from "../src/lib/calendar-assistant";
import type { MessageIntent, MoneyDraft, AskDraft } from "../src/lib/calendar-assistant";
import { assistantReply } from "../src/lib/telegram-assistant";
import { answerAsk, closeDebt, formatMoney, periodStart } from "../src/lib/bot-memory";
import { prisma } from "../src/lib/prisma";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("❌", msg);
    process.exitCode = 1;
  } else console.log("✅", msg);
}

assert(isGoogleConfigured(), "env GOOGLE_* настроены");

const enc = encryptSecret("1//refresh-token-example");
assert(decryptSecret(enc) === "1//refresh-token-example", "AES-GCM шифрование/расшифровка");
assert(encryptSecret("x") !== encryptSecret("x"), "случайный iv — шифртексты разные");

const state = makeOAuthState("123456789");
assert(verifyOAuthState(state) === "123456789", "state: подпись и chatId");
assert(verifyOAuthState(state.replace(/.$/, (c) => (c === "a" ? "b" : "a"))) === null, "state: подделка отклоняется");
assert(verifyOAuthState("1.2.3") === null, "state: мусор отклоняется");
const url = connectUrlForChat("123456789");
assert(url.startsWith("https://potolok.ai/api/google/start?c="), "ссылка кнопки → /api/google/start (постоянная)");
assert(verifyConnectToken(makeConnectToken("123456789")) === "123456789", "connect-токен: подпись и chatId");
assert(verifyConnectToken("123456789.fake") === null, "connect-токен: подделка отклоняется");
const auth = new URL(googleAuthUrl(state));
assert(auth.searchParams.get("scope") === "https://www.googleapis.com/auth/calendar.events", "scope calendar.events");
assert(auth.searchParams.get("access_type") === "offline" && auth.searchParams.get("prompt") === "consent", "offline + consent");
assert(auth.searchParams.get("redirect_uri") === "https://potolok.ai/api/google/callback", "redirect_uri прод");

const d = zonedLocalToDate("2026-10-18T15:00", "Asia/Almaty");
assert(d.toISOString() === "2026-10-18T10:00:00.000Z", "Алматы 15:00 = 10:00 UTC");
assert(formatLocalIso(d, "Asia/Almaty") === "2026-10-18T15:00:00", "обратно в локальное");

async function main() {
const tz = "Asia/Almaty";
// Событие → карточка; вопрос/болтовня → intent question/chat (ответит ассистент).
const samples: Array<[string, "event" | "question" | "chat"]> = [
  ["замер завтра в 3, Сифулина 12, Айгерим, телефон 87771234567", "event"],
  ["монтаж в пятницу с 10 до 14, Абая 5 кв 14, Серик", "event"],
  ["позвонить Марату в понедельник в 9 утра", "event"],
  ["у Данияра день рождения 25 октября", "event"],
  ["замер завтра у Айгерим", "event"],
  ["надо съездить к Марату", "event"],
  ["замер завтра в 15, Абая 5, Серик", "event"],
  ["что ты умеешь", "question"],
  ["привет", "chat"],
  ["как отправить КП клиенту", "question"],
];
for (const [text, want] of samples) {
  const t0 = Date.now();
  const r = await extractEvent({ text, timeZone: tz, current: null });
  console.log(`\n— «${text}» (${Date.now() - t0} ms) → intent=${r.intent}`);
  if (r.draft) console.log(formatDraftCard(r.draft, tz).replace(/<[^>]+>/g, ""));
  assert(r.intent === want, `intent «${text}» = ${want}`);
  if (text === "замер завтра у Айгерим") assert(r.draft?.start && r.draft.timeUnknown, "дата без времени → timeUnknown, без вопроса");
  if (text === "у Данияра день рождения 25 октября") assert(r.draft?.allDay, "день рождения → весь день");
  if (text === "надо съездить к Марату") assert(r.draft && !r.draft.start, "нет даты → start null (код спросит «Когда?» один раз)");
}

// Правка черновика
const base = await extractEvent({ text: "замер завтра в 15:00, Сейфуллина 12, Айгерим", timeZone: tz, current: null });
const edited = await extractEvent({ text: "в 16:30 и это монтаж", timeZone: tz, current: base.draft });
console.log("\n— правка «в 16:30 и это монтаж»:");
if (edited.draft) console.log(formatDraftCard(edited.draft, tz).replace(/<[^>]+>/g, ""));
assert(edited.draft?.kind === "install" && edited.draft?.start?.endsWith("16:30") && edited.draft?.address === "Сейфуллина 12", "правка сохранила адрес и поменяла время/тип");

// Баг 19.10: «Ещё не знаю» в ответ на вопрос не должен обнулять дату
const sv = await extractEvent({ text: "Завтра замер в 7 вечера, Светлана", timeZone: tz, current: null });
assert(sv.draft?.start?.endsWith("19:00") && sv.draft?.clientName === "Светлана", "«в 7 вечера» → 19:00, Светлана");
const dk = await extractEvent({ text: "Ещё не знаю", timeZone: tz, current: sv.draft });
console.log("\n— «Ещё не знаю» поверх черновика:");
if (dk.draft) console.log(formatDraftCard(dk.draft, tz).replace(/<[^>]+>/g, ""));
assert(dk.intent === "event" && dk.draft?.start === sv.draft?.start && dk.draft?.clientName === "Светлана", "«не знаю» не трогает дату и имя");

// Ответ ассистента (без Telegram)
for (const q of ["что ты умеешь", "как отправить КП клиенту"]) {
  const a = await assistantReply(q, { master: { firstName: "Нариман", language: "ru" }, calendarConnected: true });
  console.log(`\n— ассистент «${q}»:\n${a}`);
  assert(a.length > 20 && !/не понял, какое событие/i.test(a), `ассистент ответил на «${q}»`);
}
assert(/запомни|деньги|заработал/i.test(await assistantReply("что ты умеешь", { master: null, calendarConnected: false })), "«что ты умеешь» упоминает память/деньги");

// ── Память и бухгалтер (22.10.2026) ─────────────────────────────────────
console.log("\n══ Память и деньги ══");
assert(normalizeAmount(85) === 85000 && normalizeAmount(120000) === 120000 && normalizeAmount("1 500") === 1500 && normalizeAmount(0) === null, "normalizeAmount: 85 → 85 000, 120000 как есть");
assert(formatMoney(120000) === "120 000 ₸", "formatMoney 120 000 ₸");
const ps = periodStart("today", tz, new Date("2026-10-22T18:00:00Z"));
assert(ps.toISOString() === "2026-10-21T19:00:00.000Z", "periodStart today = локальная полночь Алматы (22.10 00:00 = 21.10 19:00Z)");

type MemCase = { text: string; intent: MessageIntent; check?: (r: { money?: MoneyDraft | null; ask?: AskDraft | null; note?: string | null }) => boolean; label?: string };
const memCases: MemCase[] = [
  { text: "запомни: у Серика ключ от склада", intent: "note", check: (r) => /ключ от склада/i.test(r.note ?? ""), label: "note с текстом" },
  { text: "не забыть позвонить Болату", intent: "note" },
  { text: "сегодня заработал 120 тысяч от Асель", intent: "money", check: (r) => r.money?.kind === "income" && r.money.amount === 120000 && /асель/i.test(r.money.counterparty ?? ""), label: "income 120 000 Асель" },
  { text: "получил остаток 85 тысяч", intent: "money", check: (r) => r.money?.kind === "income" && r.money.amount === 85000, label: "income 85 000" },
  { text: "потратил 30 на материалы", intent: "money", check: (r) => r.money?.kind === "expense" && r.money.amount === 30000, label: "expense 30 000 материалы" },
  { text: "заплатил монтажникам 40 тысяч", intent: "money", check: (r) => r.money?.kind === "expense" && r.money.amount === 40000, label: "expense 40 000 монтажникам" },
  { text: "Марат занял 50 тысяч, отдаст в пятницу", intent: "money", check: (r) => r.money?.kind === "debt_to_me" && r.money.amount === 50000 && !!r.money.dueAt, label: "debt_to_me 50 000 с датой" },
  { text: "я должен Ерлану 20 тысяч", intent: "money", check: (r) => r.money?.kind === "debt_mine" && r.money.amount === 20000, label: "debt_mine 20 000" },
  { text: "Марат отдал", intent: "money", check: (r) => r.money?.kind === "debt_closed" && /марат/i.test(r.money.counterparty ?? ""), label: "debt_closed Марат" },
  { text: "что я записывал?", intent: "ask", check: (r) => r.ask?.ask === "notes", label: "ask notes" },
  { text: "кто мне должен?", intent: "ask", check: (r) => r.ask?.ask === "debts", label: "ask debts" },
  { text: "сколько заработал за неделю?", intent: "ask", check: (r) => r.ask?.ask === "money_period" && r.ask.period === "week", label: "ask money_period week" },
  { text: "сколько потратил на материалы?", intent: "ask", check: (r) => r.ask?.ask === "money_search" && /материал/i.test(r.ask.query ?? ""), label: "ask money_search материалы" },
  { text: "замер завтра в 15, Абая 5, Серик", intent: "event" },
  { text: "сколько стоит подписка", intent: "question" },
];
for (const c of memCases) {
  const t0 = Date.now();
  const r = await extractEvent({ text: c.text, timeZone: tz, current: null });
  console.log(`— «${c.text}» (${Date.now() - t0} ms) → ${r.intent} ${JSON.stringify(r.money ?? r.ask ?? r.note ?? "")}`);
  assert(r.intent === c.intent, `intent «${c.text}» = ${c.intent}`);
  if (c.check) assert(c.check(r), c.label ?? c.text);
}

// Ответы из базы — тестовый чат, записи чистим в конце
const chat = "selftest-bot-memory";
await prisma.botNote.deleteMany({ where: { telegramChatId: chat } });
try {
  await prisma.botNote.createMany({
    data: [
      { telegramChatId: chat, kind: "note", text: "у Серика ключ от склада" },
      { telegramChatId: chat, kind: "note", text: "позвонить Болату" },
      { telegramChatId: chat, kind: "income", text: "остаток за зал", amount: 120000, counterparty: "Асель" },
      { telegramChatId: chat, kind: "expense", text: "материалы", amount: 30000 },
      { telegramChatId: chat, kind: "debt_to_me", text: "долг", amount: 50000, counterparty: "Марат", dueAt: new Date() },
      { telegramChatId: chat, kind: "debt_mine", text: "долг", amount: 20000, counterparty: "Ерлан" },
    ],
  });
  const notes = await answerAsk(chat, { ask: "notes", period: null, query: null }, {});
  console.log("\n— что я записывал:\n" + notes.replace(/<[^>]+>/g, ""));
  assert(/ключ от склада/.test(notes) && /Болату/.test(notes), "список заметок");
  const debts = await answerAsk(chat, { ask: "debts", period: null, query: null }, {});
  console.log("\n— кто мне должен:\n" + debts.replace(/<[^>]+>/g, ""));
  assert(/Марат — 50 000 ₸/.test(debts) && /Ерлан — 20 000 ₸/.test(debts) && /Должны тебе/.test(debts), "долги в обе стороны с суммами");
  const week = await answerAsk(chat, { ask: "money_period", period: "week", query: null }, {});
  console.log("\n— за неделю:\n" + week.replace(/<[^>]+>/g, ""));
  assert(/Получил: 120 000 ₸/.test(week) && /Потратил: 30 000 ₸/.test(week) && /Итого: \+90 000 ₸/.test(week), "доходы/расходы/итог за неделю");
  const mat = await answerAsk(chat, { ask: "money_search", period: null, query: "материалы" }, {});
  console.log("\n— на материалы:\n" + mat.replace(/<[^>]+>/g, ""));
  assert(/30 000 ₸/.test(mat), "поиск по «материалы»");
  const closed = await closeDebt(chat, { kind: "debt_closed", amount: null, counterparty: "Марата", dueAt: null, text: "" });
  console.log("\n— Марат отдал: " + closed);
  assert(/Марат рассчитался/.test(closed), "закрытие долга по имени в косвенном падеже");
  const debts2 = await answerAsk(chat, { ask: "debts", period: null, query: null }, {});
  assert(!/Марат/.test(debts2) && /Ерлан/.test(debts2), "после закрытия Марата нет в долгах");
  const part = await closeDebt(chat, { kind: "debt_closed", amount: 5000, counterparty: "Ерлан", dueAt: null, text: "" });
  console.log("— вернул Ерлану 5: " + part);
  assert(/осталось 15 000 ₸/.test(part), "частичный возврат уменьшает долг");
} finally {
  await prisma.botNote.deleteMany({ where: { telegramChatId: chat } });
}
}
main().then(() => process.exit(process.exitCode ?? 0));
