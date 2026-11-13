/**
 * Лёгкая копия логотипа мастера для превью ссылок (og:image) — 12.11.2026.
 *
 * WhatsApp может не показать картинку превью тяжелее ~300 КБ, а у 10 из 122
 * мастеров логотип в Blob весит 314–397 КБ (PNG 768² с прозрачностью, старые
 * файлы до ужатия). Файлы мастеров не трогаем: в PDF нужен оригинал 800 px.
 * Вместо этого /api/og-logo?u=<logoUrl> отдаёт копию 600 px:
 *  - есть альфа → PNG (палитра), прозрачность сохраняем: белый знак на
 *    прозрачном фоне при заливке белым стал бы пустым квадратом;
 *  - нет альфы → JPEG 80.
 *
 * Роут ходит наружу только на наш Blob — иначе это открытый прокси (SSRF).
 */

import sharp from "sharp";

export const OG_LOGO_SIDE = 600;
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
/**
 * Логотипы мастеров в Blob: /logos/<id мастера>/<файл> — так их кладёт загрузка, и так лежат
 * все 124 logoUrl и все 148 записей истории логотипов (проверено по базе 13.11.2026).
 * Строгий вид пути отсекает перебор произвольных адресов ещё до запроса в Blob.
 */
const LOGO_PATH = /^\/logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/i;

/**
 * Хост НАШЕГО Blob-стора. Суффикса .public.blob.vercel-storage.com мало:
 * под ним сторы всех клиентов Vercel, и через наш домен можно было бы
 * ужимать и раздавать чужие картинки. Берём BLOB_PUBLIC_HOST, иначе id стора
 * из BLOB_READ_WRITE_TOKEN (vercel_blob_rw_<storeId>_<secret>). Не нашли —
 * null: прокси выключен, превью берёт исходный logoUrl.
 */
/**
 * Хост — наш Blob-стор? true/false, либо null, когда id стора в окружении не найден
 * (тогда вызывающий решает сам: прокси выключается, сохранение логотипа — см. /api/logo/save).
 */
export function isOurBlobHost(hostname: string): boolean | null {
  const ours = ourBlobHost();
  return ours ? hostname.toLowerCase() === ours : null;
}

function ourBlobHost(): string | null {
  const explicit = process.env.BLOB_PUBLIC_HOST?.trim().toLowerCase();
  if (explicit) return explicit;
  const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(process.env.BLOB_READ_WRITE_TOKEN ?? "");
  return m ? `${m[1].toLowerCase()}${BLOB_HOST_SUFFIX}` : null;
}

/**
 * Разрешён ли адрес для скачивания: только https, только хост нашего
 * Blob-стора, без логина/пароля и без нестандартного порта, только логотипы
 * (/logos/<id мастера>/<файл>), без query и hash. Возвращает нормализованный URL или null.
 */
export function allowedLogoSource(raw: string | null | undefined): URL | null {
  if (!raw || raw.length > 2048) return null;
  const ours = ourBlobHost();
  if (!ours) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443") return null;
  if (u.hostname.toLowerCase() !== ours) return null;
  // Без query/hash (ревью 8d): ?x=1, ?x=2 — разные ключи CDN-кэша → каждый раз sharp.
  // Пустые «?»/«#» URL тоже хранит (search/hash пустые, но toString с ними) — отбрасываем ниже.
  if (u.search || u.hash) return null;
  // Ресайзим только логотипы. pathname уже нормализован WHATWG: «/logos/../x» и
  // «/logos/%2e%2e/x» → «/x»; «%2F» не декодируется, «/logos%2F…» сюда не пролезет.
  if (!LOGO_PATH.test(u.pathname)) return null;
  return new URL(`${u.protocol}//${u.host}${u.pathname}`);
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://potolok.ai").replace(/\/$/, "");
}

/**
 * Каноническая строка запроса прокси для источника: ровно один параметр `u`, закодированный
 * encodeURIComponent. Её строит ogLogoProxyUrl, и на неё роут перенаправляет запросы с лишними
 * параметрами или ненормализованным источником: один логотип = один адрес в og:image.
 */
export function ogLogoCanonicalSearch(src: URL): string {
  return `?u=${encodeURIComponent(src.toString())}`;
}

/** Адрес лёгкой копии логотипа для og:image, или null, если источник не наш Blob. */
export function ogLogoProxyUrl(logoUrl: string | null | undefined): string | null {
  const src = allowedLogoSource(logoUrl);
  if (!src) return null;
  return `${siteUrl()}/api/og-logo${ogLogoCanonicalSearch(src)}`;
}

/** Копия 600 px: с альфой — PNG (прозрачность сохраняем), без — JPEG 80. EXIF-поворот применяем. */
export async function renderOgLogo(input: Buffer): Promise<{ body: Buffer; contentType: "image/png" | "image/jpeg" }> {
  const base = sharp(input, { failOn: "none", limitInputPixels: 50_000_000 }).rotate();
  const meta = await base.metadata();
  const resized = base.resize({ width: OG_LOGO_SIDE, height: OG_LOGO_SIDE, fit: "inside", withoutEnlargement: true });
  return meta.hasAlpha
    ? { body: await resized.png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer(), contentType: "image/png" }
    : { body: await resized.jpeg({ quality: 80, mozjpeg: true }).toBuffer(), contentType: "image/jpeg" };
}
