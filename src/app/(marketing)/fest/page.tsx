import type { Metadata } from "next";
import { Suspense } from "react";
import FestClient from "./fest-client";

export const metadata: Metadata = {
  title: "Потолок Фест Астана 2026 — promo FEST2026 для мастеров",
  description:
    "Замер по фото за 30 сек, КП в PDF с 3D, договор с электронной подписью. 30 дней Pro бесплатно по промокоду FEST2026. Встречаемся 18-19 июня в Астане.",
  openGraph: {
    title: "Потолок Фест Астана 2026 — promo FEST2026",
    description:
      "Замер по фото, 3D-конструктор, договор с эл. подписью. 30 дней Pro бесплатно для участников феста.",
    type: "website",
    locale: "ru_KZ",
  },
};

export default function FestPage() {
  return (
    <Suspense fallback={null}>
      <FestClient />
    </Suspense>
  );
}
