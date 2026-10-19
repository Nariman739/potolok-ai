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
import { extractEvent, formatDraftCard, zonedLocalToDate, formatLocalIso } from "../src/lib/calendar-assistant";
import { assistantReply } from "../src/lib/telegram-assistant";

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
}
main().then(() => process.exit(process.exitCode ?? 0));
