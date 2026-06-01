import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMaster } from "@/lib/auth";
import { verifyTelegramConnectToken, signOAuthState } from "@/lib/instagram-state";

// GET /api/auth/instagram/connect
//   - from web/mobile dashboard: requires a valid session cookie / Bearer
//   - from Telegram bot: requires a signed ?tg=<token> issued by the bot
// Either way, the masterId is derived from a trusted source, never from raw query.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "INSTAGRAM_APP_ID not configured" }, { status: 500 });
  }

  let masterId: string | null = null;

  const tgToken = searchParams.get("tg");
  if (tgToken) {
    const chatId = verifyTelegramConnectToken(tgToken);
    if (chatId) {
      const master = await prisma.master.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true },
      });
      masterId = master?.id || null;
    }
  } else {
    const master = await getCurrentMaster();
    masterId = master?.id || null;
  }

  if (!masterId) {
    return NextResponse.json(
      { error: "Не авторизованы. Войдите в potolok.ai или используйте ссылку из Telegram-бота." },
      { status: 401 }
    );
  }

  const state = signOAuthState(masterId);
  const redirectUri = `${getBaseUrl(request)}/api/auth/instagram/callback`;

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
