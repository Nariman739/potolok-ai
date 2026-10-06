import type { Metadata } from "next";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AppLanding, type Platform } from "./app-landing";

// Лендинг для трафика из рекламы (Instagram Reels → «Узнать больше»).
// Одна задача: мастер с телефона за пять секунд попадает в нужный стор.
// Платформу определяем на сервере по User-Agent, чтобы кнопка не «прыгала» после загрузки.

export const metadata: Metadata = {
  title: "Potolok.ai — приложение мастера натяжных потолков",
  description:
    "Замерил. Посчитал. Отправил. Вбей размеры стен — комната начертится сама, площадь и цена клиенту уже посчитаны. Бесплатно для iPhone и Android.",
  openGraph: {
    title: "Potolok.ai — приложение мастера натяжных потолков",
    description:
      "Вбей размеры стен — комната начертится сама, площадь и цена клиенту уже посчитаны. Попробуй бесплатно.",
    images: [{ url: "/app/og.png", width: 1080, height: 1920 }],
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

// Реальное число мастеров в базе (без QA-аккаунтов) — для строки «N мастеров уже в приложении».
// Кэш на час, чтобы не ходить в базу на каждый показ рекламы; при сбое — последнее известное значение.
const mastersCount = unstable_cache(
  async () => {
    try {
      return await prisma.master.count({ where: { NOT: { firstName: { startsWith: "QA" } } } });
    } catch {
      return 389;
    }
  },
  ["app-landing-masters"],
  { revalidate: 3600 },
);

function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ua = (await headers()).get("user-agent") ?? "";
  const sp = await searchParams;
  const masters = await mastersCount();
  const pick = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v.slice(0, 100) : null;
  };

  return (
    <AppLanding
      masters={masters}
      platform={detectPlatform(ua)}
      utm={{
        source: pick("utm_source"),
        campaign: pick("utm_campaign"),
        content: pick("utm_content"),
      }}
    />
  );
}
