/**
 * Ужатие логотипа мастера перед Vercel Blob (02.11.2026).
 *
 * Логотип вшивается в каждый PDF КП/договора и грузится на каждой публичной
 * странице КП. До этого файл клали как есть: 71 из 279 логотипов весили
 * больше 1 МБ (до 2,6 МБ), и КП у четверти мастеров уходило клиенту файлом
 * на 2–3 МБ вместо ~200 КБ. В PDF логотип печатается ~3–4 см — 800 px по
 * длинной стороне хватает и для печати.
 *
 * С прозрачностью — PNG с палитрой (8 бит, 256 цветов: для знака с плоскими
 * цветами потерь не видно, вес падает в 3–5 раз). Без прозрачности — JPEG.
 * Если ужатое не меньше исходного (уже мелкий файл) — отдаём исходный.
 *
 * 12.11.2026: но только если его не надо поворачивать. Портрет с телефона
 * хранит пиксели «лёжа» и EXIF-флаг поворота (orientation 5–8). Браузер флаг
 * читает, а react-pdf — нет, и мелкий такой JPEG ложился в КП/договор боком:
 * исходник уходил как есть, а .rotate() срабатывал только в пережатой копии.
 * Теперь при любом флаге, кроме 1, отдаём повёрнутую копию, даже если она
 * чуть тяжелее.
 */
import sharp from "sharp";
import { sniffImageFormat } from "@/lib/logo-image";

export const LOGO_MAX_SIDE = 800;

export type CompressedLogo = { body: Buffer; contentType: string; ext: "png" | "jpg" };

export async function compressLogo(input: Buffer): Promise<CompressedLogo> {
  const fmt = sniffImageFormat(input);
  const original: CompressedLogo | null =
    fmt === "png" ? { body: input, contentType: "image/png", ext: "png" }
    : fmt === "jpeg" ? { body: input, contentType: "image/jpeg", ext: "jpg" }
    : null;

  const base = sharp(input, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const resized = base.resize({ width: LOGO_MAX_SIDE, height: LOGO_MAX_SIDE, fit: "inside", withoutEnlargement: true });

  const out: CompressedLogo = meta.hasAlpha
    ? { body: await resized.png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer(), contentType: "image/png", ext: "png" }
    : { body: await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), contentType: "image/jpeg", ext: "jpg" };

  const needsRotate = (meta.orientation ?? 1) !== 1;
  if (original && !needsRotate && out.body.length >= original.body.length) return original;
  return out;
}
