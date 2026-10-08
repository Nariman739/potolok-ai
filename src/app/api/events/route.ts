import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// События приложения (09.10.2026). Мобилка шлёт пачкой:
//   POST /api/events { platform, appVersion, events: [{ name, props?, ts? }] }
// Первая цель — считать открытия 3D и итог 3D-сессии (жесты, fps, GPU),
// до этого открытие 3D не оставляло в базе никакого следа.
//
// Считать: select name, count(*), count(distinct "masterId")
//          from "AppEvent" where "createdAt" > now() - interval '14 days' group by 1;

const MAX_EVENTS = 50;
const NAME_RE = /^[a-z0-9_]{1,40}$/;

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, max) : null;
}

export async function POST(request: Request) {
  let master;
  try {
    master = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: { platform?: unknown; appVersion?: unknown; events?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const platform = str(body.platform, 10);
  const appVersion = str(body.appVersion, 30);
  const raw = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];

  const rows = raw.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const name = str((e as { name?: unknown }).name, 40);
    if (!name || !NAME_RE.test(name)) return [];
    const props = (e as { props?: unknown }).props;
    const ts = (e as { ts?: unknown }).ts;
    const createdAt = typeof ts === "number" && ts > 1_600_000_000_000 ? new Date(ts) : undefined;
    const propsStr = props && typeof props === "object" ? JSON.stringify(props) : null;
    const row: Prisma.AppEventCreateManyInput = {
      masterId: master.id,
      name,
      // Ограничиваем размер пропсов: это телеметрия, не хранилище.
      props: propsStr && propsStr.length <= 4000 ? (props as Prisma.InputJsonValue) : undefined,
      platform,
      appVersion,
      ...(createdAt ? { createdAt } : {}),
    };
    return [row];
  });

  if (rows.length === 0) return new NextResponse(null, { status: 204 });

  try {
    await prisma.appEvent.createMany({ data: rows });
  } catch (e) {
    console.error("[events] insert failed", e);
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
