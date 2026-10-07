// Нормализация логотипа перед сохранением (07.10.2026).
//
// Зачем: Recraft отдаёт WebP, а мы клали его под именем .png — react-pdf
// понимает только PNG/JPG и молча пропускал картинку: у 8 мастеров логотип
// не печатался в КП. Заодно решаем «белый квадрат» на тёмных обложках:
// промпт просит белый фон (так модель рисует чище), а здесь внешний белый
// фон делаем прозрачным и срезаем пустые поля, чтобы логотип не был крошкой
// в квадрате 24–36 pt.
//
// Прозрачным становится только белое, которое касается края картинки
// (заливка от границы): белые элементы внутри знака остаются.
import sharp from "sharp";

const MAX_SIDE = 768;
/** Порог «почти белого» по каждому каналу. */
const WHITE = 235;

export type NormalizedLogo = { png: Buffer; width: number; height: number };

/** Любая картинка (png/jpg/webp) → PNG с прозрачным внешним фоном, обрезанный по содержимому, вписанный в квадрат. */
export async function normalizeLogo(input: Buffer): Promise<NormalizedLogo> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Заливка от границы: помечаем белые пиксели, достижимые с края.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const isWhite = (i: number) => px[i * 4] >= WHITE && px[i * 4 + 1] >= WHITE && px[i * 4 + 2] >= WHITE;
  const push = (i: number) => {
    if (!visited[i] && isWhite(i)) {
      visited[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % width;
    const y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  let cleared = 0;
  for (let i = 0; i < width * height; i++) {
    if (visited[i]) {
      px[i * 4 + 3] = 0;
      cleared++;
    }
  }

  // Картинка целиком белая (модель нарисовала пустоту) — оставляем как есть,
  // иначе после trim не останется ничего.
  const allCleared = cleared >= width * height - 10;
  let img = sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), {
    raw: { width, height, channels: 4 },
  });
  if (allCleared) {
    img = sharp(input).ensureAlpha();
  } else {
    // Срезаем прозрачные поля, оставляем небольшой воздух.
    img = img.trim({ threshold: 1 });
  }

  // Вписываем в квадрат с прозрачными полями: в PDF и на сайте логотип
  // показывают в фиксированных квадратах, без этого широкий знак сплющится.
  const trimmed = await img.png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const w = meta.width ?? width;
  const h = meta.height ?? height;
  const side = Math.min(MAX_SIDE, Math.max(w, h));
  const png = await sharp(trimmed)
    .resize({ width: side, height: side, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { png, width: side, height: side };
}

/** Первые байты файла → формат, не доверяя расширению. */
export function sniffImageFormat(buf: Buffer): "png" | "jpeg" | "webp" | "heic" | "unknown" {
  if (buf.length < 12) return "unknown";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  const brand = buf.subarray(4, 12).toString("ascii");
  if (brand.startsWith("ftyp") && /heic|heix|hevc|mif1|msf1/.test(brand)) return "heic";
  return "unknown";
}
