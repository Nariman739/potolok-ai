"use client";

import { useEffect, useState } from "react";

// Кнопки «ссылки в профиле». Платформа определяется на клиенте: нужный стор поднимается первым
// и подсвечивается, второй остаётся рядом. Клики по сторам уходят в AppLinkClick (source "go"),
// чтобы в отчётах было видно, сколько людей пришло из TikTok/Instagram.

const IOS_URL = "https://apps.apple.com/kz/app/potolok-ai/id6766588501";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=ai.potolok.app";
const INSTAGRAM_URL = "https://www.instagram.com/potolok.ai/";
const GROUP_URL = "/wa?src=go";
const SUPPORT_URL =
  "https://wa.me/77758899739?text=" + encodeURIComponent("Здравствуйте! Пишу из TikTok, вопрос по приложению potolok.ai: ");

type Platform = "ios" | "android" | "other";

function detect(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function track(platform: Platform) {
  // Lead для Meta (09.11.2026) — как на /app и на главной.
  try {
    window.fbq?.("track", "Lead", { content_name: platform });
  } catch {
    /* пиксель не загрузился */
  }
  try {
    const body = JSON.stringify({ event: "click", platform, source: "go" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/app-click", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/app-click", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    // статистика не должна мешать переходу
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
      <path fill="#34A853" d="M3.6 2.4 13.3 12 3.6 21.6c-.4-.2-.6-.6-.6-1.1V3.5c0-.5.2-.9.6-1.1Z" />
      <path fill="#FBBC04" d="m16.6 15.3-3.3-3.3 3.3-3.3 3.9 2.2c1.1.6 1.1 1.6 0 2.2l-3.9 2.2Z" />
      <path fill="#EA4335" d="M13.3 12 3.6 21.6c.3.2.8.2 1.3-.1l11.7-6.2-3.3-3.3Z" />
      <path fill="#4285F4" d="M13.3 12 3.6 2.4c.3-.2.8-.2 1.3.1l11.7 6.2-3.3 3.3Z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.2c2.7 0 3 0 4 .1 1 0 1.6.2 2 .4.5.2.9.4 1.3.8.4.4.6.8.8 1.3.2.4.3 1 .4 2 .1 1 .1 1.3.1 4s0 3-.1 4c0 1-.2 1.6-.4 2-.2.5-.4.9-.8 1.3-.4.4-.8.6-1.3.8-.4.2-1 .3-2 .4-1 .1-1.3.1-4 .1s-3 0-4-.1c-1 0-1.6-.2-2-.4-.5-.2-.9-.4-1.3-.8-.4-.4-.6-.8-.8-1.3-.2-.4-.3-1-.4-2-.1-1-.1-1.3-.1-4s0-3 .1-4c0-1 .2-1.6.4-2 .2-.5.4-.9.8-1.3.4-.4.8-.6 1.3-.8.4-.2 1-.3 2-.4 1-.1 1.3-.1 4-.1Zm0 1.8c-2.6 0-2.9 0-4 .1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1.1-.1 1.4-.1 4s0 2.9.1 4c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1.1.1 1.4.1 4 .1s2.9 0 4-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1.1.1-1.4.1-4s0-2.9-.1-4c0-.9-.2-1.4-.3-1.7-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.8-.3-1.7-.3-1.1-.1-1.4-.1-4-.1Zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm5.2-2.9a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.2l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.5.3-.5v-.5l-.9-2.2c-.2-.5-.5-.5-.7-.5h-.3Z" />
    </svg>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 19c.4-3.3 3-5 6.2-5s5.8 1.7 6.2 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.6 14.2c2.9.2 5.1 1.8 5.6 4.8" />
    </svg>
  );
}

function StoreButton({
  href,
  platform,
  primary,
  icon,
  kicker,
  label,
}: {
  href: string;
  platform: Platform;
  primary: boolean;
  icon: React.ReactNode;
  kicker: string;
  label: string;
}) {
  return (
    <a
      href={href}
      onClick={() => track(platform)}
      className={
        primary
          ? "group flex items-center gap-4 rounded-2xl bg-[#F8FAFC] px-5 py-4 text-[#0B1220] shadow-[0_12px_40px_-12px_rgba(96,165,250,0.55)] transition active:scale-[0.985]"
          : "group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-[#F1F5F9] backdrop-blur transition hover:bg-white/[0.07] active:scale-[0.985]"
      }
    >
      <span className={primary ? "text-[#0B1220]" : "text-[#F1F5F9]"}>{icon}</span>
      <span className="flex flex-col leading-tight">
        <span className={primary ? "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#475569]" : "text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]"}>
          {kicker}
        </span>
        <span className="text-[17px] font-bold">{label}</span>
      </span>
      <Chevron className={primary ? "ml-auto h-5 w-5 shrink-0 text-[#94A3B8] transition group-hover:translate-x-0.5" : "ml-auto h-5 w-5 shrink-0 text-[#64748B] transition group-hover:translate-x-0.5"} />
    </a>
  );
}

function LinkCard({
  href,
  icon,
  title,
  subtitle,
  accent,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07] active:scale-[0.985]"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent}`}>{icon}</span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[16px] font-semibold text-[#F1F5F9]">{title}</span>
        <span className="mt-0.5 text-[13px] leading-snug text-[#94A3B8]">{subtitle}</span>
      </span>
      <Chevron className="ml-auto h-5 w-5 shrink-0 text-[#64748B] transition group-hover:translate-x-0.5" />
    </a>
  );
}

export function GoLinks({ masters }: { masters: number }) {
  const [platform, setPlatform] = useState<Platform>("other");
  useEffect(() => setPlatform(detect()), []);

  const ios = (
    <StoreButton
      key="ios"
      href={IOS_URL}
      platform="ios"
      primary={platform !== "android"}
      icon={<AppleIcon className="h-7 w-7" />}
      kicker="Скачать для iPhone"
      label="App Store"
    />
  );
  const android = (
    <StoreButton
      key="android"
      href={ANDROID_URL}
      platform="android"
      primary={platform === "android"}
      icon={<PlayIcon className="h-7 w-7" />}
      kicker="Скачать для Android"
      label="Google Play"
    />
  );

  return (
    <div className="go-in mt-8 flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#93C5FD]">Приложение</h2>
          <span className="text-[13px] text-[#94A3B8]"><b className="font-bold text-[#F1F5F9]">{masters.toLocaleString("ru-RU")}</b> мастеров уже в деле</span>
        </div>
        {platform === "android" ? [android, ios] : [ios, android]}
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#93C5FD]">Мы на связи</h2>
        <LinkCard
          href={GROUP_URL}
          icon={<PeopleIcon className="h-6 w-6 text-[#25D366]" />}
          title="Группа мастеров"
          subtitle="WhatsApp · опыт коллег"
          accent="bg-[#25D366]/15"
        />
        <LinkCard
          href={INSTAGRAM_URL}
          external
          icon={<InstagramIcon className="h-6 w-6 text-[#F472B6]" />}
          title="Instagram @potolok.ai"
          subtitle="Короткие уроки по замеру и КП"
          accent="bg-[#F472B6]/15"
        />
        <LinkCard
          href={SUPPORT_URL}
          external
          icon={<WhatsAppIcon className="h-6 w-6 text-[#60A5FA]" />}
          title="Написать нам"
          subtitle="WhatsApp · ответим за час"
          accent="bg-[#60A5FA]/15"
        />
      </section>

      <style>{`
        .go-in > section { opacity: 0; transform: translateY(10px); animation: goIn .5s ease-out forwards; }
        .go-in > section:nth-child(2) { animation-delay: .12s; }
        @keyframes goIn { to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .go-in > section { animation: none; opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
