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
 *
 * Почему node:https, а не fetch: fetch в Node сам распаковывает gzip, и мы бы
 * отдавали 6,8 МБ сырого JS, которые Vercel на краю заново жал бы в brotli
 * (замер 04.11: 24–67 с на бандл). Здесь байты апстрима идут как есть вместе
 * с его content-encoding (eascdn хранит бандл gzip-ом, 3,35 МБ) — Vercel
 * повторно не сжимает, клиент (NSURLSession/OkHttp) распаковывает сам, хэш
 * expo-updates считает по распакованному файлу. Ответ стримится, без
 * буферизации; статус апстрима — как есть.
 */
import https from "node:https";
import { Readable } from "node:stream";

const UPSTREAM_TIMEOUT_MS = 25_000;

type Kind = "manifest" | "asset";

/** Заголовки запроса, которые уходят апстриму. */
function pickRequestHeaders(src: Headers, kind: Kind): Record<string, string> {
  const out: Record<string, string> = {};
  src.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.startsWith("expo-") || k.startsWith("eas-")) out[k] = value;
    else if (k === "accept" || k === "user-agent" || k === "accept-encoding") out[k] = value;
    else if (kind === "asset" && (k === "authorization" || k === "a-im")) out[k] = value;
  });
  return out;
}

/** Заголовки ответа, которые возвращаем клиенту (плюс все expo-*). */
const PASS_RESPONSE = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "cache-control",
  "etag",
  "last-modified",
  "expires",
  "vary",
  "location",
]);

function pickResponseHeaders(src: NodeJS.Dict<string | string[]>): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined) continue;
    const k = key.toLowerCase();
    if (!k.startsWith("expo-") && !PASS_RESPONSE.has(k)) continue;
    out.set(k, Array.isArray(value) ? value.join(", ") : value);
  }
  return out;
}

export function proxyToExpo(request: Request, upstreamUrl: string, kind: Kind): Promise<Response> {
  const u = new URL(upstreamUrl);
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: Response) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers: pickRequestHeaders(request.headers, kind) },
      (res) => {
        clearTimeout(timer);
        const status = res.statusCode ?? 502;
        // Лог — только статус, размер и длительность; значения заголовков (в т.ч. authorization) не пишем.
        const size = res.headers["content-length"] ?? "chunked";
        if (status >= 400) {
          // Ошибка апстрима: тело (текст от Expo, до 1 КБ) и ИМЕНА пробрасываемых заголовков —
          // чтобы понять, чего не хватает клиенту; тело всё равно отдаём клиенту как есть.
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.length < 64 && chunks.push(c));
          res.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8").replace(/\s+/g, " ").slice(0, 1000);
            console.warn(`[eas-proxy] ${kind} upstream ${status} ${Date.now() - started}ms headers=[${Object.keys(pickRequestHeaders(request.headers, kind)).join(",")}] body=${JSON.stringify(body)}`);
            finish(new Response(method === "HEAD" ? null : Buffer.concat(chunks), { status, headers: pickResponseHeaders(res.headers) }));
          });
          return;
        }
        if (kind === "asset") {
          res.once("close", () => console.log(`[eas-proxy] asset ${status} ${size} ${res.complete ? "done" : "aborted"} ${Date.now() - started}ms`));
        }
        if (method === "HEAD") {
          res.resume();
          finish(new Response(null, { status, headers: pickResponseHeaders(res.headers) }));
          return;
        }
        finish(new Response(Readable.toWeb(res) as ReadableStream, { status, headers: pickResponseHeaders(res.headers) }));
      },
    );
    // Таймаут — на ожидание заголовков апстрима. Когда ответ пошёл, тело
    // стримится без ограничения (медленный клиент — не ошибка апстрима).
    const timer = setTimeout(() => req.destroy(new Error("upstream timeout")), UPSTREAM_TIMEOUT_MS);
    req.on("error", (e) => {
      clearTimeout(timer);
      const timeout = e.message === "upstream timeout";
      console.warn(`[eas-proxy] ${kind} upstream ${timeout ? "timeout" : "error"} ${Date.now() - started}ms`, timeout ? "" : e.message);
      finish(new Response(timeout ? "upstream timeout" : "upstream error", { status: timeout ? 504 : 502 }));
    });
    req.end();
  });
}
