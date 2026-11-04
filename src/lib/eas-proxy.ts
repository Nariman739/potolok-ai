/**
 * Прокси EAS Update через potolok.ai (04.11.2026, «OTA-Россия»).
 *
 * u.expo.dev (манифест) и assets.eascdn.net (бандл 6,8 МБ и ассеты) стоят за
 * Cloudflare, а провайдеры РФ с июня 2025 режут соединения к IP Cloudflare
 * после первых ~16 КБ: манифест доходит, бандл — нет, и мастера из России
 * неделями сидят на встроенном коде стора (Максим, СПб). Vercel из России
 * работает. Expo для этого предусматривает «request proxying»: в eas.json
 * cli.updateManifestHostOverride / updateAssetHostOverride, и приложение
 * (с нативной сборки 1.0.77, где updates.url = potolok.ai) ходит сюда, а мы —
 * к Expo. Старые сборки знают только u.expo.dev и этим кодом не пользуются.
 *
 * Правила из документации (docs.expo.dev/eas-update/request-proxying):
 *   манифест → u.expo.dev, пробросить путь, query и заголовки expo-* / eas-*;
 *   ассеты   → assets.eascdn.net, то же + authorization и a-im (ассеты
 *              отдаются только с timed-HMAC authorization из манифеста,
 *              иначе 403 «Unauthorized asset request»).
 * Ответ отдаём потоком, без буферизации (бандл > 4,5 МБ лимита Vercel для
 * небуферизованных ответов), статус апстрима — как есть.
 */

const UPSTREAM_TIMEOUT_MS = 25_000;

/** Заголовки запроса, которые уходят апстриму. */
function pickRequestHeaders(src: Headers, kind: "manifest" | "asset"): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith("expo-") || k.startsWith("eas-")) out.set(k, value);
    else if (k === "accept" || k === "user-agent") out.set(k, value);
    else if (kind === "asset" && (k === "authorization" || k === "a-im")) out.set(k, value);
  });
  // Апстрим отдаёт сырые байты: fetch в Node сам бы распаковал gzip, а мы бы
  // отдали клиенту распакованное тело с чужими content-encoding/length.
  out.set("accept-encoding", "identity");
  return out;
}

/** Заголовки ответа, которые возвращаем клиенту. */
const PASS_RESPONSE = new Set([
  "content-type",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
  "expires",
  "vary",
]);

function pickResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith("expo-") || PASS_RESPONSE.has(k)) out.set(k, value);
  });
  // content-encoding мы не пробрасываем (просили identity), поэтому и
  // content-length апстрима относится к тому же телу, что отдаём.
  if (src.get("content-encoding") && src.get("content-encoding") !== "identity") {
    out.delete("content-length");
  }
  return out;
}

export async function proxyToExpo(request: Request, upstreamUrl: string, kind: "manifest" | "asset"): Promise<Response> {
  const controller = new AbortController();
  // Таймаут — на ожидание заголовков апстрима. Когда ответ пошёл, тело
  // стримится без ограничения (медленный клиент — не ошибка апстрима).
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: pickRequestHeaders(request.headers, kind),
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e instanceof Error && e.name === "AbortError";
    console.warn(`[eas-proxy] ${kind} upstream ${aborted ? "timeout" : "error"} ${Date.now() - started}ms`, aborted ? "" : e);
    return new Response(aborted ? "upstream timeout" : "upstream error", { status: aborted ? 504 : 502 });
  }
  clearTimeout(timer);

  const headers = pickResponseHeaders(upstream.headers);
  if (upstream.status >= 400) {
    console.warn(`[eas-proxy] ${kind} upstream ${upstream.status} ${Date.now() - started}ms`);
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}
