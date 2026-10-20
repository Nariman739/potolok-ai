import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Короткая ссылка potolok.ai/wa → WhatsApp-группа мастеров «Potolok.AI • Мастера».
// Считает переход в AppLinkClick (event "wa_group", source из ?src / utm_source),
// чтобы видеть, сколько людей пошло в группу из рекламы, подписей и приложения.
// Ссылку группы можно поменять через env WA_GROUP_URL без правки сайта и приложения.

const DEFAULT_GROUP_URL = "https://chat.whatsapp.com/LWqjL7j1ABj7fAz1UQsHZv";

function platformOf(ua: string): "ios" | "android" | "other" {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function str(v: string | null, max: number): string | null {
  return v && v.length > 0 ? v.slice(0, max) : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") ?? "";
  const sp = url.searchParams;

  try {
    await prisma.appLinkClick.create({
      data: {
        event: "wa_group",
        platform: platformOf(ua),
        source: str(sp.get("src") ?? sp.get("utm_source"), 100),
        campaign: str(sp.get("utm_campaign"), 100),
        content: str(sp.get("utm_content"), 100),
        userAgent: str(ua, 300),
      },
    });
  } catch (e) {
    // Статистика не должна мешать переходу в группу.
    console.error("[wa] insert failed", e);
  }

  return NextResponse.redirect(process.env.WA_GROUP_URL || DEFAULT_GROUP_URL, 302);
}
