import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { GoLinks } from "./go-links";

// «Ссылка в профиле» для TikTok и Instagram (07.11.2026): одна страница, где человек с телефона
// одним тапом попадает в стор, Instagram, WhatsApp-группу мастеров или в чат поддержки.
// Клики по сторам считаются в AppLinkClick (source "go"), переход в группу — через /wa?src=go.

export const metadata: Metadata = {
  title: "Potolok.ai — приложение, группа мастеров, связаться",
  description:
    "Приложение мастера натяжных потолков: замер, чертёж и КП в телефоне. App Store, Google Play, Instagram, WhatsApp-группа мастеров.",
  openGraph: {
    title: "Potolok.ai — приложение мастера натяжных потолков",
    description: "Замер, чертёж и КП — в телефоне. Скачать, группа мастеров, Instagram.",
    images: [{ url: "/app/og.png", width: 1080, height: 1920 }],
  },
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

const mastersCount = unstable_cache(
  async () => {
    try {
      return await prisma.master.count({ where: { NOT: { firstName: { startsWith: "QA" } } } });
    } catch {
      return 1000;
    }
  },
  ["go-masters"],
  { revalidate: 3600 },
);

const FEATURES: { title: string; text: string }[] = [
  { title: "Замер", text: "Вбей стены — комната начертится сама" },
  { title: "КП", text: "Цена клиенту ещё на объекте" },
  { title: "Договор", text: "Договор и наряд из того же замера" },
];

export default async function GoPage() {
  const masters = await mastersCount();

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#0B1220] text-[#F1F5F9]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1E3A8A_0%,_#0B1220_55%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#60A5FA]/20 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col px-5 pb-10 pt-12">
        <header className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-[22px] bg-[#60A5FA]/40 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/app/icon.png"
              alt="Potolok.ai"
              width={84}
              height={84}
              className="relative rounded-[22px] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/15"
            />
          </div>
          <h1 className="mt-5 text-[30px] font-extrabold tracking-tight">
            potolok<span className="text-[#60A5FA]">.ai</span>
          </h1>
          <p className="mt-2 max-w-[320px] text-[16px] leading-relaxed text-[#CBD5E1]">
            Приложение мастера натяжных потолков.{" "}
            <span className="text-[#F1F5F9]">Замер, чертёж и КП — в телефоне.</span>
          </p>
        </header>

        <ul className="mt-7 grid grid-cols-3 gap-2">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="text-[13px] font-bold text-[#93C5FD]">{f.title}</div>
              <div className="mt-1 text-[12px] leading-snug text-[#94A3B8]">{f.text}</div>
            </li>
          ))}
        </ul>

        <GoLinks masters={masters} />

        <footer className="mt-10 flex flex-col items-center gap-1 text-center text-[12px] text-[#64748B]">
          <span>Казахстан и Россия · Astana, 2026</span>
          <a href="https://potolok.ai" className="text-[#94A3B8] underline-offset-4 hover:underline">
            potolok.ai
          </a>
        </footer>
      </div>
    </main>
  );
}
