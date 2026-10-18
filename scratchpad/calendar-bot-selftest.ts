// Самопроверка модулей календаря без Telegram (17.10.2026):
//   npx tsx --env-file=.env.local scratchpad/calendar-bot-selftest.ts
// Проверяет: шифрование, state-токен, конвертацию времени, извлечение события ИИ.
import {
  encryptSecret,
  decryptSecret,
  makeOAuthState,
  verifyOAuthState,
  connectUrlForChat,
  googleAuthUrl,
  isGoogleConfigured,
} from "../src/lib/google-calendar";
import { extractEvent, formatDraftCard, zonedLocalToDate, formatLocalIso } from "../src/lib/calendar-assistant";

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
assert(url.startsWith("https://potolok.ai/api/google/start?s="), "ссылка кнопки → /api/google/start");
const auth = new URL(googleAuthUrl(state));
assert(auth.searchParams.get("scope") === "https://www.googleapis.com/auth/calendar.events", "scope calendar.events");
assert(auth.searchParams.get("access_type") === "offline" && auth.searchParams.get("prompt") === "consent", "offline + consent");
assert(auth.searchParams.get("redirect_uri") === "https://potolok.ai/api/google/callback", "redirect_uri прод");

const d = zonedLocalToDate("2026-10-18T15:00", "Asia/Almaty");
assert(d.toISOString() === "2026-10-18T10:00:00.000Z", "Алматы 15:00 = 10:00 UTC");
assert(formatLocalIso(d, "Asia/Almaty") === "2026-10-18T15:00:00", "обратно в локальное");

async function main() {
const tz = "Asia/Almaty";
const samples = [
  "замер завтра в 3, Сифулина 12, Айгерим, телефон 87771234567",
  "монтаж в пятницу с 10 до 14, Абая 5 кв 14, Серик",
  "позвонить Марату в понедельник в 9 утра",
  "у Данияра день рождения 25 октября",
  "привет как дела",
  "замер у Айгерим на Сейфуллина 12",
];
for (const text of samples) {
  const t0 = Date.now();
  const r = await extractEvent({ text, timeZone: tz, current: null });
  console.log(`\n— «${text}» (${Date.now() - t0} ms)`);
  if (r.draft) console.log(formatDraftCard(r.draft, tz).replace(/<[^>]+>/g, ""));
  else console.log("(не событие)");
  if (r.question) console.log("❓", r.question);
}

// Правка черновика
const base = await extractEvent({ text: "замер завтра в 15:00, Сейфуллина 12, Айгерим", timeZone: tz, current: null });
const edited = await extractEvent({ text: "в 16:30 и это монтаж", timeZone: tz, current: base.draft });
console.log("\n— правка «в 16:30 и это монтаж»:");
if (edited.draft) console.log(formatDraftCard(edited.draft, tz).replace(/<[^>]+>/g, ""));
assert(edited.draft?.kind === "install" && edited.draft?.start?.endsWith("16:30") && edited.draft?.address === "Сейфуллина 12", "правка сохранила адрес и поменяла время/тип");
}
main().then(() => process.exit(process.exitCode ?? 0));
