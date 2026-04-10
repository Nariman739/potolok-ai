import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLongLivedToken } from "@/lib/instagram";
import { sendTelegramMessage } from "@/lib/telegram";

const GRAPH_FB_API = "https://graph.facebook.com/v21.0";

// GET /api/auth/instagram/callback?code=xxx&state=xxx
// Facebook redirects here after user grants permission
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied access
  if (error) {
    return NextResponse.redirect(new URL("/instagram-connected?status=denied", getBaseUrl(request)));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=missing_params", getBaseUrl(request)));
  }

  // Decode state
  let masterId: string;
  try {
    const state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    masterId = state.masterId;
    // Check timestamp — reject if older than 1 hour
    if (Date.now() - state.ts > 3600000) {
      return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=expired", getBaseUrl(request)));
    }
  } catch {
    return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=invalid_state", getBaseUrl(request)));
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=config", getBaseUrl(request)));
  }

  try {
    const redirectUri = `${getBaseUrl(request)}/api/auth/instagram/callback`;

    // Step 1: Exchange code for short-lived token
    const tokenUrl = new URL(`${GRAPH_FB_API}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("[Instagram OAuth] Token exchange error:", tokenData.error);
      return NextResponse.redirect(new URL(`/instagram-connected?status=error&msg=token_exchange`, getBaseUrl(request)));
    }

    const shortToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token (60 days)
    const longLived = await getLongLivedToken(shortToken);

    // Step 3: Get user's Facebook Pages
    const pagesRes = await fetch(
      `${GRAPH_FB_API}/me/accounts?access_token=${longLived.token}`
    );
    const pagesData = await pagesRes.json();

    if (!pagesData.data?.length) {
      return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=no_pages", getBaseUrl(request)));
    }

    // Step 4: Find Instagram Business Account linked to a page
    let instagramUserId: string | null = null;
    let instagramUsername: string | null = null;
    let pageToken: string | null = null;

    for (const page of pagesData.data) {
      const igRes = await fetch(
        `${GRAPH_FB_API}/${page.id}?fields=instagram_business_account{id,username}&access_token=${page.access_token}`
      );
      const igData = await igRes.json();

      if (igData.instagram_business_account) {
        instagramUserId = igData.instagram_business_account.id;
        instagramUsername = igData.instagram_business_account.username || null;
        pageToken = page.access_token;
        break;
      }
    }

    if (!instagramUserId || !pageToken) {
      return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=no_instagram", getBaseUrl(request)));
    }

    // Step 5: Exchange page token for long-lived page token
    const longPageToken = await getLongLivedToken(pageToken);

    // Step 6: Save to database
    const expiresAt = new Date(Date.now() + longPageToken.expiresIn * 1000);

    await prisma.instagramAccount.upsert({
      where: { masterId },
      update: {
        instagramUserId,
        accessToken: longPageToken.token,
        tokenExpiresAt: expiresAt,
        username: instagramUsername,
        isActive: true,
      },
      create: {
        masterId,
        instagramUserId,
        accessToken: longPageToken.token,
        tokenExpiresAt: expiresAt,
        username: instagramUsername,
      },
    });

    // Step 7: Notify master via Telegram
    const master = await prisma.master.findUnique({
      where: { id: masterId },
      select: { telegramChatId: true, firstName: true },
    });

    if (master?.telegramChatId) {
      await sendTelegramMessage(
        master.telegramChatId,
        `✅ <b>Instagram подключён!</b>\n\n` +
        `Аккаунт: <b>@${instagramUsername || "подключён"}</b>\n\n` +
        `Теперь отправьте фото потолка — AI создаст пост для вашего Instagram.\n\n` +
        `/post — начать`
      );
    }

    return NextResponse.redirect(
      new URL(`/instagram-connected?status=success&username=${instagramUsername || ""}`, getBaseUrl(request))
    );
  } catch (err) {
    console.error("[Instagram OAuth] Callback error:", err);
    return NextResponse.redirect(new URL("/instagram-connected?status=error&msg=internal", getBaseUrl(request)));
  }
}

function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname === "localhost") {
    return `${url.protocol}//${url.host}`;
  }
  return "https://potolok.ai";
}
