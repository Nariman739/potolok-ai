import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

// GET /api/auth/instagram/connect?from=telegram&chatId=xxx
// Generates Facebook OAuth URL and redirects user to it
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not configured" }, { status: 500 });
  }

  // Find master by chatId (from Telegram) or by session cookie (from dashboard)
  let masterId: string | null = null;

  if (chatId) {
    const master = await prisma.master.findUnique({
      where: { telegramChatId: chatId },
      select: { id: true },
    });
    masterId = master?.id || null;
  } else {
    // Try session cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;
    if (sessionToken) {
      const session = await prisma.session.findUnique({
        where: { token: sessionToken },
        select: { masterId: true, expiresAt: true },
      });
      if (session && session.expiresAt > new Date()) {
        masterId = session.masterId;
      }
    }
  }

  if (!masterId) {
    return NextResponse.json(
      { error: "Аккаунт не найден. Привяжите Telegram к potolok.ai" },
      { status: 401 }
    );
  }

  // Generate state token (masterId encrypted simple — for CSRF + identification)
  const state = Buffer.from(JSON.stringify({ masterId, ts: Date.now() })).toString("base64url");

  const redirectUri = `${getBaseUrl(request)}/api/auth/instagram/callback`;

  // Facebook OAuth URL with Instagram permissions
  const oauthUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  oauthUrl.searchParams.set("client_id", appId);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("scope", [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
  ].join(","));

  return NextResponse.redirect(oauthUrl.toString());
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname === "localhost") {
    return `${url.protocol}//${url.host}`;
  }
  return "https://potolok.ai";
}
