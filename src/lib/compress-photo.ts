/**
 * Сжатие фото позиций прайса перед Vercel Blob (13.10.2026).
 *
 * Мастер снимает профиль/софит на телефон — 3–6 МБ на снимок. В прайсе и КП
 * такое не нужно: ужимаем до 1600px по длинной стороне, JPEG 82%, с учётом
 * EXIF-поворота. Если sharp не смог (HEIC без libheif, битый файл) —
 * отдаём оригинал, лишь бы не сломать загрузку.
 */
import sharp from "sharp";

export type CompressedPhoto = { body: Buffer | File; contentType: string; ext: string };

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
