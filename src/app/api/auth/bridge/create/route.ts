import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

const BRIDGE_TTL_MS = 60_000; // 60 seconds — long enough to open a browser tab.

/**
 * Откуда пришёл запрос на мост. Платформу храним в токене, а не определяем
 * по браузеру при переходе: встроенный браузер приложения на iPhone и обычный
 * Safari неотличимы по User-Agent, а сайт должен прятать цены только для
 * первого (App Store 3.1.1). Приложение может прислать platform явно; иначе —
 * по User-Agent самого fetch'а из React Native (это не Safari).
 */
function detectPlatform(ua: string, explicit: unknown): "ios" | "android" | null {
  if (explicit === "ios" || explicit === "android") return explicit;
  if (/iPhone|iPad|iPod|CFNetwork|Darwin/i.test(ua)) return "ios";
  if (/Android|okhttp/i.test(ua)) return "android";
  return null;
}

// POST /api/auth/bridge/create
// Authenticated (cookie or Bearer). Returns { token, expiresAt } — the caller
// (mobile app) embeds the token in a URL: /api/auth/bridge?bt=<token>&redirect=…
// The token is single-use and expires in 60s, so it stays useful even if it
// leaks to logs.
export async function POST(request: Request) {
  let master;
  try {
    master = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { platform?: unknown };
  const platform = detectPlatform(request.headers.get("user-agent") ?? "", body.platform);

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + BRIDGE_TTL_MS);

  await prisma.bridgeToken.create({
    data: { masterId: master.id, token, platform, expiresAt },
  });

  return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
}
