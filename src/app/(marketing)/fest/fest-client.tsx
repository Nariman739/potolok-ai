"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  FileText,
  CheckCircle2,
  Sparkles,
  MapPin,
  Calendar,
  Copy,
  Check,
  Send,
} from "lucide-react";
import { toast } from "sonner";

const PROMO_CODE = "FEST2026";

type LeadType = "master" | "distributor" | "salon";

export default function FestClient() {
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    type: "master" as LeadType,
    objectsPerMonth: "",
  });

  useEffect(() => {
    const utm = searchParams.get("utm_source");
    if (utm === "qr" || utm === "fest") {
      toast.success(`Промокод ${PROMO_CODE} активирован`, {
        description: "3 месяца Pro после регистрации",
      });
    }
  }, [searchParams]);

  const copyPromo = async () => {
    await navigator.clipboard.writeText(PROMO_CODE);
    setCopied(true);
    toast.success("Промокод скопирован");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/fest/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source: searchParams.get("utm_source") || "direct",
        }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
      toast.success("Заявка отправлена! Свяжемся в течение часа");
    } catch {
      toast.error("Ошибка отправки. Напишите в Telegram-бот @potolokaiBot");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <style>{`
        @keyframes orb-fest-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(30px, -20px) scale(1.05); }
        }
        @keyframes orb-fest-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(-25px, 15px) scale(0.95); }
        }
        .orb-fest-1 { animation: orb-fest-1 16s ease-in-out infinite; }
        .orb-fest-2 { animation: orb-fest-2 20s ease-in-out infinite; }
        .dot-grid-fest {
          background-image: radial-gradient(circle, #334155 1px, transparent 1px);
          background-size: 28px 28px;
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(249,115,22,0.4); }
          50% { box-shadow: 0 0 50px rgba(249,115,22,0.7); }
        }
        .promo-glow { animation: pulse-glow 3s ease-in-out infinite; }
      `}</style>

      {/* Hero */}
      <section className="relative py-20 md:py-28 px-4 overflow-hidden">
        <div className="orb-fest-1 absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-orange-500/15 blur-[120px] pointer-events-none" />
        <div className="orb-fest-2 absolute -top-16 -right-16 w-[420px] h-[420px] rounded-full bg-blue-600/15 blur-[100px] pointer-events-none" />
        <div className="dot-grid-fest absolute inset-0 opacity-20 pointer-events-none" />

        <div className="container mx-auto max-w-5xl relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5 text-sm text-orange-300 mb-6">
            <Sparkles className="h-4 w-4" />
            Потолок Фест Астана · 18-19 июня 2026
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-[1.05]">
            {/* SLOGAN_PLACEHOLDER — финализируется в slogan-candidates.md */}
            Зашёл.{" "}
            <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
              Замерил.
            </span>{" "}
            Подписал.
          </h1>

          <p className="text-lg sm:text-xl text-[#94A3B8] mb-10 max-w-2xl leading-relaxed">
            Замер по фото за 30 секунд → 3D-проект → коммерческое предложение в
            PDF → договор с электронной подписью. За один выезд к клиенту.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#promo"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-7 py-4 text-base font-semibold text-white hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] hover:-translate-y-0.5 transition-all"
            >
              <Sparkles className="h-5 w-5" />
              Получить промокод {PROMO_CODE}
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#334155] bg-[#1A2332] px-7 py-4 text-base font-semibold text-[#F1F5F9] hover:border-[#475569] transition-colors"
            >
              Как это работает
            </a>
          </div>

          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#64748B]">
            <span className="inline-flex items-center gap-2">
              <Calendar className="h-4 w-4" /> 18-19 июня 2026
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Астана
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Стенд potolok.ai
            </span>
          </div>
        </div>
      </section>

      {/* 3 выгоды */}
      <section id="how-it-works" className="py-20 px-4 border-t border-[#334155]/50">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Один инструмент на телефоне —{" "}
            <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
              весь рабочий день
            </span>
          </h2>
          <p className="text-center text-[#94A3B8] mb-14 max-w-2xl mx-auto">
            Без бумаги, без Excel, без второго заезда к клиенту. От заявки в
            WhatsApp до подписанного договора — 5 минут.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-7 hover:border-orange-500/40 hover:bg-[#1e2d45] transition-all">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 mb-5">
                <Camera className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Замер по фото за 30 секунд</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                Клиент кидает 2-3 фото комнаты в Telegram — три AI-агента
                параллельно считают площадь, периметр, размеры. Без рулетки и
                выезда.
              </p>
            </div>

            <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-7 hover:border-orange-500/40 hover:bg-[#1e2d45] transition-all">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 mb-5">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">КП в PDF с 3D-картинкой</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                Визуальный конструктор: парящий потолок, П-ниша, шторный
                профиль, светильники. Клиент видит свой потолок до начала
                работы — и подписывает.
              </p>
            </div>

            <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-7 hover:border-orange-500/40 hover:bg-[#1e2d45] transition-all">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15 text-orange-400 mb-5">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Договор с электронной подписью</h3>
              <p className="text-[#94A3B8] leading-relaxed">
                ФИО + галочка + IP — законный договор по ст. 7 Закона РК «Об
                электронном документе». Без СМС, без ЭЦП, без поездок к
                нотариусу.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Промокод */}
      <section
        id="promo"
        className="py-20 px-4 border-t border-[#334155]/50 relative overflow-hidden"
      >
        <div className="orb-fest-1 absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-orange-500/10 blur-[100px] pointer-events-none" />

        <div className="container mx-auto max-w-3xl relative z-10">
          <div className="rounded-3xl border border-orange-500/30 bg-gradient-to-br from-[#1A2332] to-[#0F1724] p-8 md:p-12 text-center promo-glow">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-4 py-1.5 text-sm text-orange-300 mb-6">
              <Sparkles className="h-4 w-4" />
              Только для участников феста
            </div>

            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              3 месяца{" "}
              <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
                бесплатно
              </span>
            </h2>
            <p className="text-[#94A3B8] mb-8 max-w-xl mx-auto">
              Полный доступ к тарифу Pro: AI-замер, 3D-конструктор, договоры с
              эл. подписью, мобильное приложение. Активируется при регистрации
              по промокоду.
            </p>

            <button
              onClick={copyPromo}
              className="group inline-flex items-center gap-3 rounded-2xl border-2 border-dashed border-orange-500/40 bg-[#0F1724] px-8 py-5 hover:border-orange-500/70 transition-all"
            >
              <span className="text-2xl md:text-3xl font-mono font-bold tracking-[0.2em] text-[#F1F5F9]">
                {PROMO_CODE}
              </span>
              {copied ? (
                <Check className="h-6 w-6 text-emerald-400" />
              ) : (
                <Copy className="h-6 w-6 text-[#94A3B8] group-hover:text-orange-400 transition-colors" />
              )}
            </button>
            <p className="text-xs text-[#64748B] mt-4">Нажми чтобы скопировать</p>
          </div>
        </div>
      </section>

      {/* Форма */}
      <section className="py-20 px-4 border-t border-[#334155]/50">
        <div className="container mx-auto max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Получить промокод и личную настройку
          </h2>
          <p className="text-center text-[#94A3B8] mb-10">
            Оставь контакт — свяжемся в течение часа, настроим под твой
            регион, покажем как считать твой типовой объект.
          </p>

          {submitted ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Заявка получена</h3>
              <p className="text-[#94A3B8]">
                Свяжемся в течение часа в Telegram или WhatsApp. Промокод{" "}
                <span className="font-mono text-orange-400">{PROMO_CODE}</span> уже
                твой.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6 md:p-8 space-y-4"
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    Имя
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl border border-[#334155] bg-[#0F1724] px-4 py-3 text-[#F1F5F9] focus:border-orange-500/50 focus:outline-none transition-colors"
                    placeholder="Айдос"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    Телефон / WhatsApp
                  </label>
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-xl border border-[#334155] bg-[#0F1724] px-4 py-3 text-[#F1F5F9] focus:border-orange-500/50 focus:outline-none transition-colors"
                    placeholder="+7 7XX XXX XX XX"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    Город
                  </label>
                  <input
                    required
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full rounded-xl border border-[#334155] bg-[#0F1724] px-4 py-3 text-[#F1F5F9] focus:border-orange-500/50 focus:outline-none transition-colors"
                    placeholder="Астана"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    Кто вы
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as LeadType })
                    }
                    className="w-full rounded-xl border border-[#334155] bg-[#0F1724] px-4 py-3 text-[#F1F5F9] focus:border-orange-500/50 focus:outline-none transition-colors"
                  >
                    <option value="master">Мастер натяжных потолков</option>
                    <option value="distributor">Дистрибьютор / поставщик</option>
                    <option value="salon">Салон / шоурум</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                  Объектов в месяц (примерно)
                </label>
                <input
                  type="text"
                  value={form.objectsPerMonth}
                  onChange={(e) =>
                    setForm({ ...form, objectsPerMonth: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#334155] bg-[#0F1724] px-4 py-3 text-[#F1F5F9] focus:border-orange-500/50 focus:outline-none transition-colors"
                  placeholder="10-15"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-6 py-4 text-base font-semibold text-white hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                {submitting ? "Отправляем..." : "Получить промокод"}
              </button>

              <p className="text-xs text-[#64748B] text-center mt-2">
                Нажимая кнопку, вы соглашаетесь на обработку персональных
                данных в соответствии с законодательством РК
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Финальный CTA — увидимся на стенде */}
      <section className="py-20 px-4 border-t border-[#334155]/50 text-center">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Увидимся на стенде potolok.ai
          </h2>
          <p className="text-lg text-[#94A3B8] mb-8 max-w-xl mx-auto">
            18-19 июня в Астане. Покажем живое демо, дадим персональную
            настройку, ответим на любые вопросы про натяжные потолки и
            технологии.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-[#94A3B8]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#334155] bg-[#1A2332] px-5 py-2.5">
              <Calendar className="h-4 w-4 text-orange-400" />
              18 июня — целый день
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#334155] bg-[#1A2332] px-5 py-2.5">
              <Calendar className="h-4 w-4 text-orange-400" />
              19 июня — до обеда
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#334155] bg-[#1A2332] px-5 py-2.5">
              <MapPin className="h-4 w-4 text-orange-400" />
              Астана
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
