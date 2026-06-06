// Публичная страница AI-визуализации потолка — слайдер «до/после»
// для отправки клиенту в WhatsApp/Telegram.
//
// URL: /visual/{publicHash}
// Хэш генерируется автоматически при первом успешном render (Этап 6).

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CompareSlider } from "./compare-slider";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  const viz = await prisma.visualization.findUnique({
    where: { publicHash: hash },
    include: { master: { select: { companyName: true, firstName: true } } },
  });
  if (!viz) return { title: "Визуализация не найдена" };
  const company = viz.master.companyName || viz.master.firstName;
  return {
    title: `AI-визуализация потолка | ${company}`,
    description: `Как будет выглядеть потолок в вашей комнате — фотореалистичная AI-визуализация от ${company}`,
    openGraph: {
      title: `Ваш потолок «вживую» | ${company}`,
      description: "Посмотрите как будет выглядеть натяжной потолок в вашей комнате",
      images: viz.originalUrl ? [viz.originalUrl] : [],
    },
  };
}

export default async function VisualPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const viz = await prisma.visualization.findUnique({
    where: { publicHash: hash },
    include: {
      master: {
        select: {
          companyName: true,
          firstName: true,
          whatsappPhone: true,
          phone: true,
          logoUrl: true,
        },
      },
      renders: {
        where: { approvalStatus: "APPROVED" },
        orderBy: { approvedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!viz || viz.status !== "ready" || viz.renders.length === 0) {
    notFound();
  }

  const latestRender = viz.renders[0];
  const company = viz.master.companyName || viz.master.firstName;
  const contactPhone = viz.master.whatsappPhone || viz.master.phone;
  // Для scene3d/scene2d "до" = 3D-снимок (схема); для reference = фото комнаты клиента.
  // Если есть referenceUrl (гибридный режим) — берём его как "до" (это реальное фото).
  const beforeUrl = viz.referenceUrl || viz.originalUrl;
  const afterUrl = latestRender.url;
  const sourceLabel =
    viz.sourceType === "scene3d"
      ? "3D-проект"
      : viz.sourceType === "scene2d"
        ? "План замера"
        : "Фото комнаты";

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          {viz.master.logoUrl && (
            <img
              src={viz.master.logoUrl}
              alt={company}
              className="h-10 w-10 rounded-lg object-cover"
            />
          )}
          <div className="flex-1">
            <div className="text-lg font-semibold">{company}</div>
            <div className="text-xs text-slate-500">AI-визуализация натяжного потолка</div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          Так будет выглядеть ваш потолок
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Сравните: <strong>{sourceLabel}</strong> слева и фотореалистичная AI-визуализация справа.
          Тяните полоску влево-вправо чтобы сравнить.
        </p>

        <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} sourceLabel={sourceLabel} />

        <div className="mt-6 rounded-lg border bg-white p-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">Понравилось?</div>
          <p className="mb-3 text-sm text-slate-600">
            Свяжитесь с мастером {company} чтобы заказать такой потолок.
          </p>
          {contactPhone && (
            <a
              href={`https://wa.me/${contactPhone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              💬 Написать в WhatsApp
            </a>
          )}
        </div>

        <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-center text-[11px] leading-relaxed text-slate-500">
          Визуализация конечного результата. Оттенки освещения и фактура поверхности
          могут незначительно отличаться в реальности. Точные размеры, расстановка
          элементов и спецификация — согласно проекту и договору.
        </div>
      </section>
    </main>
  );
}
