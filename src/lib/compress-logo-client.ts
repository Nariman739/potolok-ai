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
 * - SVG — всегда растрируется в PNG (сервер SVG не принимает), см. rasterizeSvg;
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

export const LOGO_UNREADABLE_MESSAGE = "Не получилось прочитать картинку. Попробуйте PNG или JPG.";

const SVG_DEFAULT_SIDE = 800;

export async function compressLogoForUpload(file: File): Promise<File> {
  // SVG сервер не принимает (исполняемая разметка) — всегда растрируем в PNG,
  // исходник не отправляем никогда (13.11.2026).
  if (isSvg(file)) return rasterizeSvg(file);

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

  const { width, height } = fitSize(w, h);
  const baseName = baseNameOf(file);

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

function isSvg(file: File): boolean {
  return /svg/i.test(file.type) || /\.svg$/i.test(file.name);
}

function baseNameOf(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "logo";
}

function fitSize(w: number, h: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * SVG → PNG (прозрачность сохраняется). Если у SVG нет своих width/height в
 * пикселях — проставляем их сами: по пропорциям viewBox 1200 px по большей
 * стороне, без viewBox — 800×800. Без размеров Firefox/Chrome не рисуют SVG
 * в canvas (naturalWidth = 0). Не открылся — понятная ошибка, исходник не шлём.
 */
async function rasterizeSvg(file: File): Promise<File> {
  try {
    const doc = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
      throw new Error("bad svg");
    }

    const pxW = parsePx(root.getAttribute("width"));
    const pxH = parsePx(root.getAttribute("height"));
    const vb = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
    const vbW = vb.length === 4 && vb[2] > 0 ? vb[2] : null;
    const vbH = vb.length === 4 && vb[3] > 0 ? vb[3] : null;

    let w: number;
    let h: number;
    if (pxW && pxH) {
      ({ width: w, height: h } = fitSize(pxW, pxH));
    } else if (vbW && vbH) {
      const scale = MAX_SIDE / Math.max(vbW, vbH);
      w = Math.max(1, Math.round(vbW * scale));
      h = Math.max(1, Math.round(vbH * scale));
    } else {
      w = SVG_DEFAULT_SIDE;
      h = SVG_DEFAULT_SIDE;
    }
    root.setAttribute("width", String(w));
    root.setAttribute("height", String(h));

    const svgBlob = new Blob([new XMLSerializer().serializeToString(doc)], {
      type: "image/svg+xml",
    });
    const img = await loadImage(svgBlob);
    const name = baseNameOf(file);
    const png = await draw(img, w, h, "image/png");
    if (png.size <= LOGO_MAX_UPLOAD_BYTES) {
      return new File([png], `${name}.png`, { type: "image/png" });
    }
    const jpeg = await draw(img, w, h, "image/jpeg", JPEG_QUALITY, "#ffffff");
    return new File([jpeg], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    throw new Error(LOGO_UNREADABLE_MESSAGE);
  }
}

/** Ширина/высота SVG в пикселях: «120» или «120px». Проценты и em — не размеры. */
function parsePx(v: string | null): number | null {
  const m = v?.trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 ? n : null;
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

function loadImage(file: Blob): Promise<HTMLImageElement> {
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
