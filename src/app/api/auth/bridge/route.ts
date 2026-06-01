import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/auth/bridge?bt=<bridge_token>&redirect=/dashboard/branding
// SSO-мост для мобильного приложения. Mobile сначала вызывает
// POST /api/auth/bridge/create с Bearer master-session-token и получает
// одноразовый bridge_token (TTL 60s). Этот токен передаётся в URL — даже
// если он утечёт в логи / Referer / историю браузера, он действителен
// одну попытку и сгорает через минуту.
//
// Старый формат ?token=<session_token> удалён (утечка долгоживущей сессии).

const SESSION_COOKIE = "session_token";
const SESSION_DURATION_DAYS = 30;

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit(`bridge:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Слишком много попыток" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const url = new URL(request.url);
  const bridgeToken = url.searchParams.get("bt");
  const redirectParam = url.searchParams.get("redirect") || "/dashboard";

  // Open-redirect guard: только внутренние пути.
  const safeRedirect = redirectParam.startsWith("/") && !redirectParam.startsWith("//")
    ? redirectParam
    : "/dashboard";

  if (!bridgeToken) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Single-use consume: delete-by-token, then check expiry on the deleted row.
  // Race-safe: if two requests arrive concurrently, only one delete returns a row.
  const consumed = await prisma.bridgeToken
    .delete({ where: { token: bridgeToken } })
    .catch(() => null);

  if (!consumed || consumed.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Verify master is still active.
  const master = await prisma.master.findUnique({
    where: { id: consumed.masterId },
    select: { id: true, isActive: true },
  });
  if (!master?.isActive) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // Create a real 30-day session and set cookie.
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  await prisma.session.create({
    data: { masterId: master.id, token: sessionToken, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return NextResponse.redirect(new URL(safeRedirect, request.url));
}
