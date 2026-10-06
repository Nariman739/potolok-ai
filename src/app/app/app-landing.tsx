"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { PencilRuler, Calculator, Send } from "lucide-react";

export type Platform = "ios" | "android" | "other";

type Utm = { source: string | null; campaign: string | null; content: string | null };

const IOS_URL = "https://apps.apple.com/kz/app/potolok-ai/id6766588501";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=ai.potolok.app";

// Отправляем событие так, чтобы оно дошло даже когда браузер уже уходит в стор.
function track(event: "view" | "click", platform: Platform, utm: Utm) {
  try {
    const body = JSON.stringify({ event, platform, ...utm });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/app-click", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/app-click", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    // Статистика не должна мешать переходу в стор.
  }
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.37 12.77c.03 2.95 2.59 3.93 2.62 3.94-.02.07-.41 1.4-1.35 2.77-.81 1.19-1.66 2.37-2.99 2.39-1.31.03-1.73-.77-3.22-.77-1.5 0-1.96.75-3.2.8-1.28.05-2.26-1.28-3.08-2.46C3.47 17.03 2.2 12.6 3.92 9.56c.85-1.51 2.37-2.46 4.03-2.49 1.26-.02 2.45.85 3.22.85.77 0 2.22-1.05 3.74-.9.64.03 2.42.26 3.57 1.94-.09.06-2.13 1.24-2.11 3.81M13.9 5.4c.68-.82 1.14-1.97 1.01-3.11-.98.04-2.17.65-2.87 1.48-.63.73-1.18 1.9-1.03 3.02 1.09.09 2.21-.56 2.89-1.39" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M3.6 2.4 13.2 12l-9.6 9.6c-.4-.2-.6-.6-.6-1.1V3.5c0-.5.2-.9.6-1.1Z" fill="#2196F3" />
      <path d="M16.4 15.2 13.2 12l3.2-3.2 3.8 2.2c1.1.6 1.1 1.4 0 2L16.4 15.2Z" fill="#FFC107" />
      <path d="M3.6 2.4c.3-.2.8-.2 1.3.1l11.5 6.3L13.2 12 3.6 2.4Z" fill="#4CAF50" />
      <path d="M3.6 21.6 13.2 12l3.2 3.2-11.5 6.3c-.5.3-1 .3-1.3.1Z" fill="#F44336" />
    </svg>
  );
}

function StoreButton({
  store,
  platform,
  utm,
  big,
}: {
  store: "ios" | "android";
  platform: Platform;
  utm: Utm;
  big?: boolean;
}) {
  const isIos = store === "ios";
  return (
    <a
      href={isIos ? IOS_URL : ANDROID_URL}
      onClick={() => track("click", platform, utm)}
      className={[
        "group flex w-full items-center justify-center gap-3 rounded-2xl bg-white text-[#0B1220] font-bold shadow-[0_12px_40px_rgba(96,165,250,0.35)] transition-all active:scale-[0.98] hover:shadow-[0_16px_50px_rgba(96,165,250,0.5)]",
        big ? "h-16 text-lg" : "h-14 text-base",
      ].join(" ")}
    >
      {isIos ? <AppleIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
      <span>{isIos ? "Скачать в App Store" : "Скачать в Google Play"}</span>
    </a>
  );
}

function Cta({ platform, utm, big }: { platform: Platform; utm: Utm; big?: boolean }) {
  if (platform === "other") {
    return (
      <div className="flex flex-col gap-3">
        <StoreButton store="ios" platform={platform} utm={utm} big={big} />
        <StoreButton store="android" platform={platform} utm={utm} big={big} />
      </div>
    );
  }
  return <StoreButton store={platform} platform={platform} utm={utm} big={big} />;
}

export function AppLanding({ platform, utm }: { platform: Platform; utm: Utm }) {
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track("view", platform, utm);
  }, [platform, utm]);

  const features = [
    {
      icon: PencilRuler,
      title: "Вбей стены — начертит само",
      text: "Выступы, ниши, колонны, косые стены. Ты вводишь длины, комната рисуется сама.",
    },
    {
      icon: Calculator,
      title: "Площадь и углы уже посчитаны",
      text: "Площадь, периметр, дополнительные углы, софиты — всё считается, пока ты замеряешь.",
    },
    {
      icon: Send,
      title: "Цена клиенту — по твоим ценам",
      text: "Свой прайс один раз. КП готово на объекте, отправляешь в WhatsApp.",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B1220] text-[#F1F5F9]">
      {/* Фон: тёмный градиент + голубое свечение, как на иконке приложения */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1E3A8A_0%,_#0B1220_55%)]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#60A5FA]/20 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col px-5 pb-10 pt-6">
        {/* Шапка */}
        <header className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app/icon.png" alt="" width={32} height={32} className="rounded-[9px]" />
          <span className="text-base font-bold tracking-tight">
            potolok<span className="text-[#60A5FA]">.ai</span>
          </span>
        </header>

        {/* Первый экран */}
        <section className="pt-10">
          <div className="inline-flex items-center rounded-full border border-[#60A5FA]/40 bg-[#60A5FA]/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#93C5FD]">
            Мастерам натяжных потолков
          </div>

          <h1 className="mt-5 text-[44px] font-extrabold leading-[1.02] tracking-tight">
            Замерил.
            <br />
            Посчитал.
            <br />
            <span className="bg-gradient-to-r from-[#93C5FD] to-[#60A5FA] bg-clip-text text-transparent">
              Отправил.
            </span>
          </h1>

          <p className="mt-5 text-[17px] leading-relaxed text-[#CBD5E1]">
            Приложение мастера натяжных потолков. Вбей размеры стен — комната начертится сама,
            площадь и цена клиенту уже посчитаны.
          </p>

          <div className="mt-7">
            <Cta platform={platform} utm={utm} big />
          </div>
          <p className="mt-3 text-center text-sm text-[#94A3B8]">Бесплатно · iPhone и Android</p>
        </section>

        {/* Ролик в «телефоне» */}
        <section className="mt-12">
          <div className="mx-auto w-[240px] rounded-[2.2rem] border-[6px] border-[#1E293B] bg-black shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <video
              className="aspect-[9/16] w-full rounded-[1.8rem] object-cover"
              src="/app/demo.mp4"
              poster="/app/demo-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          </div>
          <p className="mt-4 text-center text-sm text-[#94A3B8]">
            Комната с восемью стенами — за минуту, прямо на объекте
          </p>
        </section>

        {/* Три пункта */}
        <section className="mt-12 flex flex-col gap-5">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#60A5FA]/15 text-[#93C5FD]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-bold leading-snug">{title}</div>
                <div className="mt-1 text-[15px] leading-relaxed text-[#94A3B8]">{text}</div>
              </div>
            </div>
          ))}
        </section>

        {/* Кто сделал */}
        <section className="mt-12 rounded-2xl border border-[#334155]/60 bg-[#111C33]/70 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#60A5FA] to-[#1E3A8A] text-xl font-extrabold text-white">
              Н
            </div>
            <div>
              <div className="font-bold">Нариман, Астана</div>
              <div className="text-sm text-[#94A3B8]">мастер натяжных потолков</div>
            </div>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-[#CBD5E1]">
            Сам занимаюсь натяжными потолками. Сделал приложение для своих замеров — чтобы не
            считать на коленке и не терять заказы. Теперь оно открыто для всех мастеров.
          </p>
        </section>

        {/* Нижний призыв */}
        <section className="mt-12">
          <Cta platform={platform} utm={utm} />
          <p className="mt-3 text-center text-sm text-[#94A3B8]">Попробуй бесплатно</p>
        </section>

        <footer className="mt-auto flex items-center justify-center gap-4 pt-12 text-xs text-[#64748B]">
          <Link href="/" className="hover:text-[#94A3B8]">potolok.ai</Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-[#94A3B8]">Конфиденциальность</Link>
          <span>·</span>
          <Link href="/terms" className="hover:text-[#94A3B8]">Условия</Link>
        </footer>
      </div>
    </main>
  );
}
