"use client";

import type { ReactNode } from "react";

// Кнопка «Скачать» на главной (09.11.2026). Реклама Meta ведёт на главную, а
// событие Lead раньше стояло только на /app — Meta не видела, кто с рекламы
// ушёл в стор, и не могла учиться. Тот же трекинг, что в app-landing.tsx:
// пиксель Lead + наш AppLinkClick (source "home"). Переходу в стор не мешаем.
export function StoreLink({
  href,
  platform,
  className,
  children,
}: {
  href: string;
  platform: "ios" | "android";
  className?: string;
  children: ReactNode;
}) {
  function onClick() {
    try {
      window.fbq?.("track", "Lead", { content_name: platform });
    } catch {
      /* пиксель не загрузился — не мешаем переходу */
    }
    try {
      const params = new URLSearchParams(window.location.search);
      const body = JSON.stringify({
        event: "click",
        platform,
        source: params.get("utm_source") ?? "home",
        campaign: params.get("utm_campaign"),
        content: params.get("utm_content"),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/app-click", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/app-click", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
      }
    } catch {
      /* статистика не должна мешать переходу */
    }
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {children}
    </a>
  );
}
