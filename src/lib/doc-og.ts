import type { Metadata } from "next";
import { ogLogoProxyUrl } from "@/lib/og-logo";

// Превью публичных документов (договор, акт, КП без 3D) в WhatsApp/Telegram —
// под брендом мастера, а не potolok.ai (11.11.2026, «Ваш Потолок»: в превью
// ссылки на договор стоял наш логотип). Картинка — логотип мастера; нет
// логотипа или он не https — картинку не задаём, мессенджер возьмёт иконку
// сайта. Описание без имени, телефона и суммы клиента: превью видно всем в
// чате, куда ссылку перешлют.

/**
 * Только абсолютный https: относительный путь или http мессенджер не покажет.
 * Логотип из нашего Blob отдаём через /api/og-logo — копия 600 px легче
 * 300 КБ, иначе WhatsApp может не показать превью (12.11.2026).
 */
export function ogLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  const proxied = ogLogoProxyUrl(logoUrl);
  if (proxied) return proxied;
  try {
    const u = new URL(logoUrl);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Страницы с данными клиента — не индексировать. `export const robots`
 *  в page.tsx Next не читает, закрывать нужно через metadata. */
export const DOC_ROBOTS: Metadata["robots"] = { index: false, follow: false };

export function brandedDocMetadata(opts: {
  title: string;
  description: string;
  logoUrl?: string | null;
}): Metadata {
  const { title, description } = opts;
  const logo = ogLogoUrl(opts.logoUrl);
  return {
    // absolute: без хвоста « | potolok.ai» из шаблона корневого layout
    title: { absolute: title },
    description,
    robots: DOC_ROBOTS,
    openGraph: {
      title,
      description,
      type: "website",
      ...(logo ? { images: [{ url: logo }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
      ...(logo ? { images: [logo] } : {}),
    },
  };
}
