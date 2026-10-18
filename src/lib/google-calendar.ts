// Google Календарь для Telegram-бота (17.10.2026).
//
// Поток: кнопка «Подключить Google Календарь» в боте → /api/google/start?s=<state>
// → экран Google «Разрешить» → /api/google/callback → токены в GoogleCalendarLink
// (refresh_token зашифрован) → бот создаёт события через Calendar API.
//
// Ключ хранения — telegramChatId: календарь работает и для чатов без аккаунта
// potolok.ai. Scope только calendar.events (создание/правка событий), чужие
// календари не читаем — см. раздел «Данные Google» в /privacy.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY (32 байта base64).

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const DEFAULT_TIMEZONE = "Asia/Almaty";
// 24 часа: кнопка в Telegram-сообщении статична, мастер жмёт её когда угодно
// (18.10.2026 Нариман нажал через 11 минут и получил «ссылка устарела»).
// State привязывает только chatId — чужой календарь к чужому чату не подцепить без самого чата.
const STATE_TTL_MS = 24 * 60 * 60 * 1000;

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://potolok.ai").replace(/\/$/, "");
}

export function googleRedirectUri(): string {
  // Redirect URI жёстко зарегистрирован в OAuth-клиенте — всегда прод-домен,
  // даже на Preview-деплоях (иначе Google отдаст redirect_uri_mismatch).
  return "https://potolok.ai/api/google/callback";
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && getTokenKey());
}

// ── Шифрование токенов (AES-256-GCM) ──────────────────────────────────────

function getTokenKey(): Buffer | null {
  const raw = process.env.GOOGLE_TOKEN_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), "base64");
  return key.length === 32 ? key : null;
}

function requireTokenKey(): Buffer {
  const key = getTokenKey();
  if (!key) throw new Error("GOOGLE_TOKEN_KEY is missing or not 32 bytes base64");
  return key;
}

/** iv(12).tag(16).ciphertext → base64 */
export function encryptSecret(plain: string): string {
  const key = requireTokenKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = requireTokenKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ── State-токен для OAuth (чат + срок + HMAC) ──────────────────────────────
// Формат: <chatId>.<expiresMs>.<hmac(base64url)>. HMAC — на ключе GOOGLE_TOKEN_KEY
// с отдельной меткой, чтобы не смешивать с шифрованием. Срок — STATE_TTL_MS.

function stateHmac(chatId: string, expires: number): string {
  const key = requireTokenKey();
  return crypto
    .createHmac("sha256", key)
    .update(`google-oauth-state:${chatId}:${expires}`)
    .digest("base64url");
}

export function makeOAuthState(chatId: string): string {
  const expires = Date.now() + STATE_TTL_MS;
  return `${chatId}.${expires}.${stateHmac(chatId, expires)}`;
}

/** Возвращает chatId или null, если подпись неверна / срок вышел. */
export function verifyOAuthState(state: string | null | undefined): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [chatId, expiresStr, sig] = parts;
  const expires = Number(expiresStr);
  if (!chatId || !Number.isFinite(expires) || expires < Date.now()) return null;
  const expected = stateHmac(chatId, expires);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return chatId;
}

/** Ссылка для кнопки в Telegram: сначала на наш /api/google/start (там редирект на Google). */
export function connectUrlForChat(chatId: string): string {
  return `${siteBaseUrl()}/api/google/start?s=${encodeURIComponent(makeOAuthState(chatId))}`;
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Обмен кода и обновление токенов ───────────────────────────────────────

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      ...body,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    const err = new Error(`google token: ${data.error || res.status} ${data.error_description || ""}`.trim());
    (err as Error & { code?: string }).code = data.error;
    throw err;
  }
  return data;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return postToken({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri() });
}

/** Почта владельца календаря — из calendarList/primary (scope calendar.events её отдаёт как id). */
async function fetchPrimaryCalendarEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id && data.id.includes("@") ? data.id : null;
  } catch {
    return null;
  }
}

/** Сохранить связь после callback. Если у чата уже есть связь — перезаписать. */
export async function saveCalendarLink(chatId: string, tokens: TokenResponse): Promise<{ email: string | null }> {
  if (!tokens.refresh_token) {
    // Бывает, если пользователь уже давал доступ без prompt=consent. У нас prompt=consent
    // всегда, но подстрахуемся понятной ошибкой.
    throw new Error("google: refresh_token отсутствует в ответе");
  }
  const master = await prisma.master.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true },
  });
  const email = await fetchPrimaryCalendarEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in - 60) * 1000);
  await prisma.googleCalendarLink.upsert({
    where: { telegramChatId: chatId },
    create: {
      telegramChatId: chatId,
      masterId: master?.id ?? null,
      email,
      refreshToken: encryptSecret(tokens.refresh_token),
      accessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
    },
    update: {
      masterId: master?.id ?? null,
      email,
      refreshToken: encryptSecret(tokens.refresh_token),
      accessToken: encryptSecret(tokens.access_token),
      accessTokenExpiresAt: expiresAt,
    },
  });
  return { email };
}

export async function getCalendarLink(chatId: string) {
  return prisma.googleCalendarLink.findUnique({ where: { telegramChatId: chatId } });
}

export async function deleteCalendarLink(chatId: string): Promise<boolean> {
  const link = await prisma.googleCalendarLink.findUnique({
    where: { telegramChatId: chatId },
    select: { id: true, refreshToken: true },
  });
  if (!link) return false;
  // Отзываем токен у Google, чтобы доступ пропал и в «Безопасность → Сторонние приложения».
  try {
    const token = decryptSecret(link.refreshToken);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    /* отзыв необязателен — связь всё равно удаляем */
  }
  await prisma.googleCalendarLink.delete({ where: { id: link.id } });
  await prisma.calendarDraft.deleteMany({ where: { telegramChatId: chatId } });
  return true;
}

export class CalendarUnlinkedError extends Error {
  constructor() {
    super("google: связь с календарём недействительна (invalid_grant)");
    this.name = "CalendarUnlinkedError";
  }
}

/** Живой access_token: из базы, пока не истёк, иначе обновить по refresh_token. */
async function getAccessToken(chatId: string): Promise<{ token: string; calendarId: string; timeZone: string }> {
  const link = await getCalendarLink(chatId);
  if (!link) throw new CalendarUnlinkedError();

  if (link.accessToken && link.accessTokenExpiresAt && link.accessTokenExpiresAt.getTime() > Date.now()) {
    return { token: decryptSecret(link.accessToken), calendarId: link.calendarId, timeZone: link.timeZone };
  }

  let refreshed: TokenResponse;
  try {
    refreshed = await postToken({ refresh_token: decryptSecret(link.refreshToken), grant_type: "refresh_token" });
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "invalid_grant") {
      // Пользователь отозвал доступ или токен протух — связь удаляем, бот предложит подключить заново.
      await prisma.googleCalendarLink.delete({ where: { id: link.id } }).catch(() => {});
      throw new CalendarUnlinkedError();
    }
    throw e;
  }
  const expiresAt = new Date(Date.now() + Math.max(60, refreshed.expires_in - 60) * 1000);
  await prisma.googleCalendarLink.update({
    where: { id: link.id },
    data: {
      accessToken: encryptSecret(refreshed.access_token),
      accessTokenExpiresAt: expiresAt,
      ...(refreshed.refresh_token ? { refreshToken: encryptSecret(refreshed.refresh_token) } : {}),
    },
  });
  return { token: refreshed.access_token, calendarId: link.calendarId, timeZone: link.timeZone };
}

// ── События ───────────────────────────────────────────────────────────────

export type CalendarEventInput = {
  summary: string;
  /** Локальное время «YYYY-MM-DDTHH:mm:ss» в timeZone связи (без смещения). Для allDay — «YYYY-MM-DD». */
  startLocal: string;
  /** Для allDay — дата СЛЕДУЮЩЕГО дня (Google считает end эксклюзивно). */
  endLocal: string;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  /** Минуты до события для всплывающих напоминаний. По умолчанию за час и за день. */
  reminderMinutes?: number[];
};

export type CreatedEvent = { id: string; htmlLink: string | null; timeZone: string };

export async function createCalendarEvent(chatId: string, input: CalendarEventInput): Promise<CreatedEvent> {
  const { token, calendarId, timeZone } = await getAccessToken(chatId);
  const reminders = input.reminderMinutes ?? [60, 24 * 60];
  const body = {
    summary: input.summary,
    location: input.location || undefined,
    description: input.description || undefined,
    start: input.allDay ? { date: input.startLocal.slice(0, 10) } : { dateTime: input.startLocal, timeZone },
    end: input.allDay ? { date: input.endLocal.slice(0, 10) } : { dateTime: input.endLocal, timeZone },
    reminders: {
      useDefault: false,
      overrides: reminders.map((minutes) => ({ method: "popup", minutes })),
    },
    source: { title: "potolok.ai", url: siteBaseUrl() },
  };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 401) {
    // access_token отозван раньше срока — сбрасываем кэш и пробуем один раз через refresh.
    await prisma.googleCalendarLink.updateMany({
      where: { telegramChatId: chatId },
      data: { accessToken: null, accessTokenExpiresAt: null },
    });
    const retry = await getAccessToken(chatId);
    const res2 = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(retry.calendarId)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${retry.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return parseEventResponse(res2, timeZone, chatId);
  }
  return parseEventResponse(res, timeZone, chatId);
}

async function parseEventResponse(res: Response, timeZone: string, chatId: string): Promise<CreatedEvent> {
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    htmlLink?: string;
    error?: { message?: string; status?: string };
  };
  if (!res.ok || !data.id) {
    throw new Error(`google events.insert ${res.status}: ${data.error?.message || data.error?.status || "unknown"}`);
  }
  await prisma.googleCalendarLink.updateMany({
    where: { telegramChatId: chatId },
    data: { eventsCreated: { increment: 1 } },
  });
  return { id: data.id, htmlLink: data.htmlLink ?? null, timeZone };
}
