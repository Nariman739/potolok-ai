import crypto from "crypto";

const TELEGRAM_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — bot link is single-session
const OAUTH_STATE_TTL_MS = 60 * 60 * 1000;    // 1h — round-trip to Facebook

function getSecret(): string {
  const secret = process.env.INSTAGRAM_STATE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "INSTAGRAM_STATE_SECRET is not set (need >=32 random chars). " +
      "Generate with: openssl rand -base64 48",
    );
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", getSecret()).update(payload).digest());
}

function timingSafeEqStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ─── Telegram bot link token ─────────────────────────────────────────────
// Bot generates a link with a signed token tying it to a specific chatId,
// so /instagram/connect can trust the chatId without a web session.

export function signTelegramConnectToken(chatId: string): string {
  const payload = b64url(Buffer.from(JSON.stringify({ chatId, ts: Date.now() })));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyTelegramConnectToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (!timingSafeEqStr(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.chatId !== "string") return null;
    if (typeof data.ts !== "number") return null;
    if (Date.now() - data.ts > TELEGRAM_TOKEN_TTL_MS) return null;
    return data.chatId;
  } catch {
    return null;
  }
}

// ─── OAuth state ─────────────────────────────────────────────────────────
// State sent to Facebook OAuth and echoed back to /callback. Must be tamper-proof
// so callback can trust the masterId it returns.

export function signOAuthState(masterId: string): string {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = b64url(Buffer.from(JSON.stringify({ masterId, nonce, ts: Date.now() })));
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string): { masterId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (!timingSafeEqStr(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.masterId !== "string") return null;
    if (typeof data.ts !== "number") return null;
    if (Date.now() - data.ts > OAUTH_STATE_TTL_MS) return null;
    return { masterId: data.masterId };
  } catch {
    return null;
  }
}
