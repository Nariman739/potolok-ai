import { NextResponse } from "next/server";
import { allowedLogoSource, renderOgLogo } from "@/lib/og-logo";

/**
 * Лёгкая копия логотипа мастера для превью ссылок (og:image), 12.11.2026.
 * Подробности — src/lib/og-logo.ts.
 *
 * GET /api/og-logo?u=<https://<store>.public.blob.vercel-storage.com/...>
 *  - чужой адрес → 400, наружу не ходим;
 *  - Blob ответил не 200 / редирект / слишком большой файл / не картинка → 302 на исходник;
 *  - иначе 600 px: с альфой PNG, без — JPEG 80. Кэш навсегда: logoUrl
 *    меняется при каждой загрузке (случайный суффикс), копия не протухнет.
 */
export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

function fallback(src: URL) {
  return NextResponse.redirect(src.toString(), {
    status: 302,
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}

/** Тип сбоя без URL (ревью 8d): в логах не светим адреса Blob. */
function errName(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}

function fail(src: URL, reason: string) {
  console.warn("[og-logo] fallback:", reason);
  return fallback(src);
}

export async function GET(request: Request) {
  const src = allowedLogoSource(new URL(request.url).searchParams.get("u"));
  if (!src) return NextResponse.json({ error: "bad source" }, { status: 400 });

  let input: Buffer;
  try {
    // redirect: "manual" — редирект с Blob не выводит запрос за пределы стора.
    const r = await fetch(src, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (r.status !== 200) return fail(src, `fetch status ${r.status}`);
    const declared = Number(r.headers.get("content-length") || 0);
    if (declared > MAX_SOURCE_BYTES) return fail(src, "source too large (declared)");
    input = Buffer.from(await r.arrayBuffer());
    if (input.length > MAX_SOURCE_BYTES) return fail(src, "source too large");
  } catch (e) {
    return fail(src, `fetch ${errName(e)}`);
  }

  try {
    const { body, contentType } = await renderOgLogo(input);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      },
    });
  } catch (e) {
    return fail(src, `render ${errName(e)}`);
  }
}
