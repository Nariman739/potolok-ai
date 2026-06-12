import type { Metadata } from "next";
import QRCode from "qrcode";
import InstallClient from "./install-client";

export const metadata: Metadata = {
  title: "Установить Potolok.ai — Потолок Фест Астана 2026",
  description:
    "Скачай мобильное приложение Potolok.ai на свой телефон. Замер по фото, 3D-конструктор, КП и договор за один выезд.",
  robots: { index: false, follow: false },
};

const ANDROID_OPTIN_URL =
  "https://play.google.com/apps/testing/ai.potolok.app";
const IOS_APP_STORE_URL = "https://apps.apple.com/kz/app/id6766588501";
const GROUP_INVITE_URL = "https://groups.google.com/g/potolok-ai-testers";
const LANDING_URL = "https://potolok.ai/fest/install";

const INSTAGRAM_URL = "https://instagram.com/potolok.ai";
const TELEGRAM_GROUP_URL = "https://t.me/potolok_ai";
const WHATSAPP_GROUP_URL =
  "https://chat.whatsapp.com/LWqjL7j1ABj7fAz1UQsHZv";

export default async function InstallPage() {
  const qrDataUrl = await QRCode.toDataURL(LANDING_URL, {
    width: 360,
    margin: 1,
    color: { dark: "#0F1724", light: "#FFFFFF" },
  });

  return (
    <InstallClient
      qrDataUrl={qrDataUrl}
      androidOptInUrl={ANDROID_OPTIN_URL}
      iosAppStoreUrl={IOS_APP_STORE_URL}
      groupInviteUrl={GROUP_INVITE_URL}
      instagramUrl={INSTAGRAM_URL}
      telegramGroupUrl={TELEGRAM_GROUP_URL}
      whatsappGroupUrl={WHATSAPP_GROUP_URL}
    />
  );
}
