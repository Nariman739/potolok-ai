/**
 * Сжатие фото позиций прайса перед Vercel Blob (13.10.2026).
 *
 * Мастер снимает профиль/софит на телефон — 3–6 МБ на снимок. В прайсе и КП
 * такое не нужно: ужимаем до 1600px по длинной стороне, JPEG 82%, с учётом
 * EXIF-поворота. Если sharp не смог (HEIC без libheif, битый файл) —
 * отдаём оригинал, лишь бы не сломать загрузку.
 */
import sharp from "sharp";

export type CompressedPhoto = {
  body: Buffer | File;
  contentType: string;
  ext: string;
  /** true — это HEIC/HEIF, который sharp не смог раскодировать: в PDF и на сайте такое не покажется */
  heic?: boolean;
};

/** HEIC/HEIF по сигнатуре: «ftyp» в байтах 4–8 (ISO BMFF), как у фото с iPhone */
export function looksLikeHeic(buf: Buffer): boolean {
  return buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heif)/.test(buf.subarray(8, 12).toString("latin1"));
}

export const HEIC_UPLOAD_ERROR = "Фото в формате HEIC не поддерживается. Отправьте JPG или PNG (на iPhone: Настройки → Камера → Форматы → «Наиболее совместимые»)";

export async function compressPhoto(file: File): Promise<CompressedPhoto> {
  const fallbackExt = (file.name.split(".").pop() || "jpg").toLowerCase();
  const isHeic = file.type === "image/heic" || file.type === "image/heif" || fallbackExt === "heic" || fallbackExt === "heif";
  const fallback: CompressedPhoto = {
    body: file,
    contentType: isHeic ? "image/jpeg" : file.type || "image/jpeg",
    ext: isHeic ? "jpg" : fallbackExt,
  };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    if (looksLikeHeic(input)) {
      // sharp без libheif — раньше такое молча уходило в Blob под именем .jpg
      // и в КП/портфолио было пустой ячейкой (27.10.2026)
      try {
        const out = await sharp(input, { failOn: "none" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        return { body: out, contentType: "image/jpeg", ext: "jpg" };
      } catch {
        return { ...fallback, heic: true };
      }
    }
    const out = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    // Если «сжатое» вышло не меньше оригинала (уже мелкий JPEG) — берём оригинал.
    if (out.length >= input.length && !isHeic) return fallback;
    return { body: out, contentType: "image/jpeg", ext: "jpg" };
  } catch {
    return fallback;
  }
}
