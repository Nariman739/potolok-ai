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
// Старый формат ?token=<session_token> временно поддерживается до
// 2026-06-15, чтобы не сломать установленные мобильные билды до
// прохождения App Store / Play Store review + auto-update у юзеров.

const SESSION_COOKIE = "session_token";
const SESSION_DURATION_DAYS = 30;
// DEPRECATED ?token= flow — remove after 2026-06-15 (мобильные релизы выкатились).
const DEPRECATED_TOKEN_SUNSET = new Date("2026-06-15T00:00:00Z");

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
  const legacyToken = url.searchParams.get("token");
  const redirectParam = url.searchParams.get("redirect") || "/dashboard";

  // Open-redirect guard: только внутренние пути.
  const safeRedirect = redirectParam.startsWith("/") && !redirectParam.startsWith("//")
    ? redirectParam
    : "/dashboard";

  if (!bridgeToken && !legacyToken) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // ── Modern path: single-use bridge token ─────────────────────────────
  if (bridgeToken) {
    // Single-use consume: delete-by-token, then check expiry on the deleted row.
    // Race-safe: if two requests arrive concurrently, only one delete returns a row.
    const consumed = await prisma.bridgeToken
      .delete({ where: { token: bridgeToken } })
      .catch(() => null);

    if (!consumed || consumed.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const master = await prisma.master.findUnique({
      where: { id: consumed.masterId },
      select: { id: true, isActive: true },
    });
    if (!master?.isActive) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    await issueSessionCookie(master.id);
    return NextResponse.redirect(new URL(safeRedirect, request.url));
  }

  // ── DEPRECATED ?token= flow — remove after 2026-06-15 ────────────────
  // Sunset enforced via 410 so it's distinguishable from generic auth fails.
  if (new Date() >= DEPRECATED_TOKEN_SUNSET) {
    return NextResponse.json(
      { error: "Deprecated parameter no longer supported. Update the mobile app." },
      { status: 410 },
    );
  }

  const session = await prisma.session.findUnique({
    where: { token: legacyToken! },
    select: {
      expiresAt: true,
      masterId: true,
      master: { select: { isActive: true } },
    },
  });

  if (!session || session.expiresAt < new Date() || !session.master.isActive) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  console.warn("[bridge] DEPRECATED ?token= usage", {
    ip,
    userAgent: request.headers.get("user-agent") ?? "unknown",
    userId: session.masterId,
    scheduledRemoval: "2026-06-15",
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, legacyToken!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return NextResponse.redirect(new URL(safeRedirect, request.url));
}

async function issueSessionCookie(masterId: string) {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);
  await prisma.session.create({
    data: { masterId, token: sessionToken, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
