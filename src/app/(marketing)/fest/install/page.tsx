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
const IOS_APP_STORE_URL =
  "https://apps.apple.com/kz/app/potolok-ai/id0000000000";
const GROUP_INVITE_URL = "https://groups.google.com/g/potolok-ai-testers";
const LANDING_URL = "https://potolok.ai/fest/install";

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
    />
  );
}
