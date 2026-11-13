/**
 * Ужатие логотипа в браузере перед отправкой на /api/logo/upload (13.11.2026).
 *
 * Зачем: Vercel режет тело запроса ~4,5 МБ и отдаёт 413 с пустым телом — до
 * нашего роута запрос не доходит, мастер видел «Не удалось загрузить логотип»
 * без причины. Сервер всё равно ужимает до 800 px (compress-logo.ts), поэтому
 * здесь достаточно 1200 px по большей стороне. В приложении то же самое делает
 * src/lib/logo.ts (до 800 px).
 *
 * Правила:
 * - маленький файл (≤ 300 КБ и ≤ 1200 px) — отправляем как есть;
 * - PNG/WEBP (может быть прозрачность) — остаётся PNG, чтобы фон не стал чёрным;
 *   если PNG всё равно вышел больше 4 МБ — JPEG на белом фоне;
 * - остальное (JPEG, HEIC в Safari) — JPEG 0.85;
 * - браузер не смог раскрыть файл (HEIC в Chrome) — отправляем как есть.
 *
 * Поворот по EXIF: декодируем через <img> — в браузерах по умолчанию
 * image-orientation: from-image, и naturalWidth/Height и drawImage уже
 * учитывают ориентацию (Chrome 81+, Safari 13.1+, Firefox 77+).
 */

export const LOGO_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const LOGO_TOO_BIG_MESSAGE =
  "Картинка слишком большая. Выберите файл поменьше (до 4 МБ) или сделайте скриншот логотипа.";

const MAX_SIDE = 1200;
const SMALL_BYTES = 300 * 1024;
const JPEG_QUALITY = 0.85;

export async function compressLogoForUpload(file: File): Promise<File> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    // HEIC в Chrome/Firefox и прочее, что браузер не раскрыл, — отдаём серверу как есть.
    return file;
  }

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return file;

  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (!isHeic && file.size <= SMALL_BYTES && w <= MAX_SIDE && h <= MAX_SIDE) {
    return file;
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const baseName = file.name.replace(/\.[^.]+$/, "") || "logo";

  try {
    const mayHaveAlpha = /png|webp/i.test(file.type);
    if (mayHaveAlpha) {
      const png = await draw(img, width, height, "image/png");
      if (png.size <= LOGO_MAX_UPLOAD_BYTES) {
        return pickSmaller(file, new File([png], `${baseName}.png`, { type: "image/png" }));
      }
      // PNG-«фото» без сжатия всё ещё огромный — JPEG на белом фоне.
    }
    const jpeg = await draw(img, width, height, "image/jpeg", JPEG_QUALITY, "#ffffff");
    return pickSmaller(file, new File([jpeg], `${baseName}.jpg`, { type: "image/jpeg" }));
  } catch {
    return file;
  }
}

/** Если сжатие не помогло, а исходник проходит лимит и не HEIC — оставляем исходник. */
function pickSmaller(original: File, compressed: File): File {
  const isHeic = /heic|heif/i.test(original.type);
  if (!isHeic && compressed.size >= original.size) return original;
  return compressed;
}

function draw(
  img: HTMLImageElement,
  width: number,
  height: number,
  type: "image/png" | "image/jpeg",
  quality?: number,
  background?: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no canvas context"));
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`cannot decode ${file.type}`));
    };
    img.src = url;
  });
}
