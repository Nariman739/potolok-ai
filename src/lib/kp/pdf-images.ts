/**
 * Ужатие картинок перед рендером PDF КП (27.10.2026).
 *
 * react-pdf вшивает JPEG в документ байт в байт, а PNG ещё и перекодирует
 * сам (медленно). Мастера грузят фото портфолио/обложки с телефона по 3–4 МБ,
 * логотипы PNG до 1,6 МБ — реальные КП выходили до 14 МБ и рендерились 6–10 с,
 * у клиента в WhatsApp такое открывается полминуты.
 *
 * Здесь каждая картинка скачивается, поворачивается по EXIF (react-pdf его не
 * читает — фото с телефона лежали боком), ужимается под размер, в котором
 * она реально печатается, и подставляется в данные как data-URL. Любая
 * неудача (таймаут, битый файл, HEIC) — оставляем исходный URL, PDF всё равно
 * соберётся как раньше.
 */
import sharp from "sharp";
import type { PdfData } from "./pdf-data";

type Role = "hero" | "portfolio" | "gallery" | "logo";

/** Длинная сторона в px: страница A4 ≈ 595×842 pt, ×2 для чёткости на экране */
const MAX_SIDE: Record<Role, number> = { hero: 1400, portfolio: 900, gallery: 900, logo: 480 };
const QUALITY: Record<Role, number> = { hero: 78, portfolio: 74, gallery: 76, logo: 85 };
const FETCH_TIMEOUT_MS = 15000;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// Кэш на тёплый инстанс: у одного мастера портфолио/логотип/обложка одни и те
// же для всех КП — не ужимать их на каждый PDF.
const cache = new Map<string, string>();
const CACHE_MAX = 60;

function remember(key: string, value: string) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_INPUT_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_INPUT_BYTES ? null : buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ужать одну картинку. null — не скачалась (оставляем URL как есть, react-pdf
 * попробует сам); "bad" — скачалась, но это не картинка для PDF (HEIC под
 * именем .jpg с iPhone — sharp без libheif, react-pdf тоже не прочтёт):
 * такую из КП убираем, иначе на её месте пустая серая ячейка.
 */
export async function shrinkImage(url: string, role: Role): Promise<string | null | "bad"> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const key = `${role}:${url}`;
  const hit = cache.get(key);
  if (hit) return hit === "bad" ? "bad" : hit;
  const input = await fetchBytes(url);
  if (!input) return null;
  try {
    const side = MAX_SIDE[role];
    const img = sharp(input, { failOn: "none", limitInputPixels: 80e6 }).rotate();
    const meta = await img.metadata();
    const keepAlpha = role === "logo" && meta.hasAlpha === true;
    const resized = img.resize({ width: side, height: side, fit: "inside", withoutEnlargement: true });
    const out = keepAlpha
      ? await resized.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await resized.jpeg({ quality: QUALITY[role], mozjpeg: true }).toBuffer();
    const dataUrl = `data:${keepAlpha ? "image/png" : "image/jpeg"};base64,${out.toString("base64")}`;
    remember(key, dataUrl);
    return dataUrl;
  } catch {
    remember(key, "bad");
    return "bad";
  }
}

/**
 * Пройтись по всем картинкам PdfData и заменить URL на ужатые data-URL.
 * Меняет объект на месте и возвращает его же. Картинки качаются параллельно.
 * Нечитаемые (HEIC) — убираются: обложка/логотип обнуляются, карточки
 * портфолио и галереи выкидываются.
 */
export async function inlinePdfImages(data: PdfData): Promise<PdfData> {
  const jobs: Promise<void>[] = [];
  const run = (url: string | null | undefined, role: Role, apply: (v: string | null) => void) => {
    if (!url || url.startsWith("data:")) return;
    jobs.push(shrinkImage(url, role).then((v) => { if (v === "bad") apply(null); else if (v) apply(v); }));
  };
  run(data.master.logoUrl, "logo", (v) => { data.master.logoUrl = v; });
  run(data.master.coverPhotoUrl, "hero", (v) => { data.master.coverPhotoUrl = v; });
  run(data.estimate.room3dPreviewUrl, "hero", (v) => { data.estimate.room3dPreviewUrl = v; });
  for (const p of data.portfolio) run(p.photoUrl, "portfolio", (v) => { p.photoUrl = v; });
  for (const g of data.gallery) run(g.url, "gallery", (v) => { g.url = v === null ? "" : v; });
  await Promise.all(jobs);
  data.portfolio = data.portfolio.filter((p) => p.photoUrl);
  data.gallery = data.gallery.filter((g) => g.url);
  return data;
}
