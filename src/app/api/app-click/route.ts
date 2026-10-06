import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Счётчик лендинга /app: просмотр страницы и нажатие на кнопку стора.
// Без авторизации и без персональных данных; принимает sendBeacon (text/plain или JSON).

const EVENTS = new Set(["view", "click"]);
const PLATFORMS = new Set(["ios", "android", "other"]);

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const event = str(body.event, 10);
  const platform = str(body.platform, 10);
  if (!event || !EVENTS.has(event) || !platform || !PLATFORMS.has(platform)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    await prisma.appLinkClick.create({
      data: {
        event,
        platform,
        source: str(body.source, 100),
        campaign: str(body.campaign, 100),
        content: str(body.content, 100),
        userAgent: str(req.headers.get("user-agent"), 300),
      },
    });
  } catch (e) {
    console.error("[app-click] insert failed", e);
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
