import { proxyToExpo } from "@/lib/eas-proxy";

// Ассеты EAS Update (бандл .hbc, картинки, шрифты) через potolok.ai →
// assets.eascdn.net/<hash>?project=… (см. src/lib/eas-proxy.ts). Сюда ведёт
// rewrite с /<hash> (next.config.ts). Тело стримится: бандл 6,8 МБ.
// Ассеты иммутабельны (адрес = хэш содержимого), апстрим отдаёт
// cache-control immutable — он пробрасывается, Vercel CDN может кэшировать.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Pro + Fluid: максимум 800 с. Длительность включает отдачу потока —
// медленный клиент из РФ может качать бандл минуту и больше.
export const maxDuration = 800;

const HASH_RE = /^[A-Za-z0-9_-]{43}$/;

async function handle(request: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params;
  const { search, searchParams } = new URL(request.url);
  // Не похоже на запрос ассета EAS (ключ — 43 символа base64url, обязателен ?project=) — 404.
  if (!HASH_RE.test(hash) || !searchParams.get("project")) return new Response(null, { status: 404 });
  return proxyToExpo(request, `https://assets.eascdn.net/${hash}${search}`, "asset");
}

export const GET = handle;
export const HEAD = handle;
