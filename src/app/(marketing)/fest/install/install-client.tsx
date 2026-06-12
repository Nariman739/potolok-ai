"use client";

import Image from "next/image";
import {
  Apple,
  Smartphone,
  Sparkles,
  Instagram,
  Send,
  MessageCircle,
  Clock,
} from "lucide-react";

type Props = {
  qrDataUrl: string;
  androidOptInUrl: string;
  iosAppStoreUrl: string;
  groupInviteUrl: string;
  instagramUrl?: string | null;
  telegramGroupUrl?: string | null;
  whatsappGroupUrl?: string | null;
};

export default function InstallClient({
  qrDataUrl,
  androidOptInUrl,
  iosAppStoreUrl,
  groupInviteUrl,
  instagramUrl,
  telegramGroupUrl,
  whatsappGroupUrl,
}: Props) {
  const anyCommunityLink = Boolean(
    instagramUrl || telegramGroupUrl || whatsappGroupUrl,
  );
  return (
    <div className="relative">
      <style>{`
        @keyframes orb-install {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.05); }
        }
        .orb-install { animation: orb-install 16s ease-in-out infinite; }
      `}</style>

      <section className="relative py-12 md:py-16 px-4 overflow-hidden">
        <div className="orb-install absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-orange-500/15 blur-[120px] pointer-events-none" />
        <div className="orb-install absolute -top-16 -right-16 w-[360px] h-[360px] rounded-full bg-blue-600/15 blur-[100px] pointer-events-none" />

        <div className="container mx-auto max-w-3xl relative z-10">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-sm text-orange-300 mb-6">
              <Sparkles className="h-4 w-4" />
              Потолок Фест Астана · 18-19 июня
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
              Установи{" "}
              <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
                Potolok.ai
              </span>{" "}
              на телефон
            </h1>

            <p className="text-base sm:text-lg text-[#94A3B8] max-w-xl mx-auto">
              Замер по фото, 3D-конструктор, КП и договор —{" "}
              <span className="text-[#F1F5F9]">в одном приложении</span>.
              Выбери свою платформу:
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-10">
            <a
              href={iosAppStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-2xl border border-[#334155] bg-[#1A2332] p-6 hover:border-orange-500/40 hover:bg-[#1e2d45] transition-all"
            >
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-white text-black shrink-0 group-hover:scale-105 transition-transform">
                <Apple className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#94A3B8] mb-1">Скачать в</p>
                <p className="text-lg font-semibold text-[#F1F5F9]">App Store</p>
                <p className="text-xs text-[#64748B] mt-1">для iPhone и iPad</p>
              </div>
            </a>

            <a
              href={androidOptInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-[#1A2332] to-[#1e2d45] p-6 hover:border-orange-500/60 hover:shadow-[0_0_30px_rgba(249,115,22,0.2)] transition-all"
            >
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white shrink-0 group-hover:scale-105 transition-transform">
                <Smartphone className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-orange-300 mb-1">Скачать на</p>
                <p className="text-lg font-semibold text-[#F1F5F9]">Android</p>
                <p className="text-xs text-[#64748B] mt-1">через Google Play</p>
              </div>
            </a>
          </div>

          <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6 md:p-8 mb-8">
            <h2 className="text-xl font-semibold mb-5 text-[#F1F5F9] flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-orange-400" />
              Как установить на Android — 2 шага
            </h2>
            <ol className="space-y-4 text-[#94A3B8]">
              <li className="flex gap-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-orange-300 text-sm font-semibold shrink-0">
                  1
                </span>
                <div className="flex-1">
                  <p className="text-[#F1F5F9] font-medium mb-1">
                    Вступи в группу тестировщиков
                  </p>
                  <p className="text-sm">
                    Нужен Google-аккаунт (тот же, что в Play Store на твоём
                    телефоне).
                  </p>
                  <a
                    href={groupInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 mt-2 underline underline-offset-4"
                  >
                    Открыть группу →
                  </a>
                </div>
              </li>
              <li className="flex gap-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-orange-300 text-sm font-semibold shrink-0">
                  2
                </span>
                <div className="flex-1">
                  <p className="text-[#F1F5F9] font-medium mb-1">
                    Открой Google Play и установи
                  </p>
                  <p className="text-sm">
                    Тапни оранжевую кнопку <span className="text-orange-400 font-medium">Android</span> в начале страницы →
                    откроется Play Store → жми «Установить». Дальше
                    обновляется автоматически, как обычное приложение.
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-8 flex items-start gap-3">
            <span className="text-xl shrink-0">🎁</span>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              <span className="text-[#F1F5F9] font-medium">
                Промокод FEST2026
              </span>{" "}
              даёт{" "}
              <span className="text-emerald-300 font-medium">
                3 месяца Pro бесплатно
              </span>
              . Введи в приложении при регистрации.
            </p>
          </div>

          <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6 md:p-8 mb-8">
            <h2 className="text-xl font-semibold mb-2 text-[#F1F5F9]">
              Делаем Potolok.AI вместе
            </h2>
            <p className="text-sm text-[#94A3B8] mb-2 leading-relaxed">
              Здесь мастера говорят что добавить или поменять в программе —
              и мы это делаем. Твой голос правда важен 🙌
            </p>
            <p className="text-sm text-[#94A3B8] mb-5 leading-relaxed">
              Шеберлер программаға не қосу керектігін айтады — біз орындаймыз.
              Сіздің пікіріңіз шынында маңызды.
            </p>

            <div className="grid sm:grid-cols-3 gap-3">
              {instagramUrl ? (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex items-center gap-3 rounded-xl border border-pink-500/30 bg-gradient-to-br from-[#1A2332] to-[#1e2d45] p-4 hover:border-pink-500/60 hover:shadow-[0_0_20px_rgba(236,72,153,0.2)] transition-all"
                >
                  <Instagram className="h-6 w-6 text-pink-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      Instagram
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      @potolok.ai
                    </p>
                  </div>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="group relative flex items-center gap-3 rounded-xl border border-[#334155] bg-[#0F1724]/60 p-4 cursor-not-allowed opacity-80"
                >
                  <Instagram className="h-6 w-6 text-pink-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      Instagram
                    </p>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wider flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      Скоро
                    </p>
                  </div>
                </button>
              )}

              {telegramGroupUrl ? (
                <a
                  href={telegramGroupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex items-center gap-3 rounded-xl border border-sky-500/30 bg-gradient-to-br from-[#1A2332] to-[#1e2d45] p-4 hover:border-sky-500/60 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)] transition-all"
                >
                  <Send className="h-6 w-6 text-sky-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      Telegram
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      t.me/potolok_ai
                    </p>
                  </div>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="group relative flex items-center gap-3 rounded-xl border border-[#334155] bg-[#0F1724]/60 p-4 cursor-not-allowed opacity-80"
                >
                  <Send className="h-6 w-6 text-sky-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      Telegram
                    </p>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wider flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      Скоро
                    </p>
                  </div>
                </button>
              )}

              {whatsappGroupUrl ? (
                <a
                  href={whatsappGroupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-[#1A2332] to-[#1e2d45] p-4 hover:border-emerald-500/60 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
                >
                  <MessageCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      WhatsApp
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      Группа мастеров
                    </p>
                  </div>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="group relative flex items-center gap-3 rounded-xl border border-[#334155] bg-[#0F1724]/60 p-4 cursor-not-allowed opacity-80"
                >
                  <MessageCircle className="h-6 w-6 text-emerald-400 shrink-0" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      WhatsApp
                    </p>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wider flex items-center gap-1 mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      Скоро
                    </p>
                  </div>
                </button>
              )}
            </div>

            {!(telegramGroupUrl && whatsappGroupUrl) && (
              <p className="text-xs text-[#64748B] mt-4">
                {anyCommunityLink
                  ? "Остальные каналы откроются к 18 июня, перед фестом."
                  : "Ссылки появятся к 18 июня, перед фестом."}
              </p>
            )}
          </div>

          <div className="hidden md:block rounded-2xl border border-[#334155] bg-[#1A2332] p-6 md:p-8 text-center">
            <p className="text-sm text-[#94A3B8] mb-4">
              Сканируй QR со своего телефона
            </p>
            <div className="inline-block rounded-2xl bg-white p-4">
              <Image
                src={qrDataUrl}
                alt="QR код установки Potolok.ai"
                width={240}
                height={240}
                unoptimized
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
