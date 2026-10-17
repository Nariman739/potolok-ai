"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

/**
 * Пиксель Meta (17.10.2026) — ретаргетинг рекламы на тех, кто заходил на
 * лендинг /app, и событие Lead при нажатии «Скачать» (см. app-landing.tsx).
 *
 * Только маркетинговые страницы: в кабинете мастера (/dashboard), у его
 * клиентов (/kp, /contract, /act, /n) и на входе (/auth) пикселя нет — это не
 * рекламная аудитория. ID не секрет, он виден в HTML любого сайта.
 */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const SKIP = ["/dashboard", "/kp", "/contract", "/act", "/n/", "/auth", "/api", "/z/", "/visual", "/render-scene", "/vision-capture"];

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function MetaPixel() {
  const pathname = usePathname() ?? "/";
  const skip = !PIXEL_ID || SKIP.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
  const first = useRef(true);

  // Клиентские переходы: базовый скрипт шлёт PageView только при загрузке.
  useEffect(() => {
    if (skip) return;
    if (first.current) { first.current = false; return; }
    window.fbq?.("track", "PageView");
  }, [pathname, skip]);

  if (skip) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} alt="" src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
