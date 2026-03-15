"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Как начать пользоваться?",
    a: "Зарегистрируйтесь, настройте свои цены, добавьте комнаты в калькуляторе — и получите расчёт за минуту. Это бесплатно.",
  },
  {
    q: "Какие позиции есть в калькуляторе?",
    a: "28+ стандартных позиций: полотно (мат/сатин/глянец), профиль (пластик/алюминий/теневой), споты, люстры, карниз, гардина, подшторник, обход труб и многое другое. Также можете добавить свои позиции.",
  },
  {
    q: "Как работает генератор договора?",
    a: "Заполните реквизиты в профиле (ИП или физлицо) — и для каждого КП автоматически формируется договор с предоплатой, гарантией и актом выполненных работ.",
  },
  {
    q: "Можно ли отправить КП клиенту?",
    a: "Да! Каждое КП имеет красивую публичную ссылку. Отправьте в WhatsApp — клиент посмотрит и подтвердит онлайн. Вы получите уведомление в Telegram.",
  },
  {
    q: "Нужно ли устанавливать приложение?",
    a: "Нет, PotolokAI работает в браузере на любом устройстве. Также есть Telegram-бот @potolokaiBot для уведомлений.",
  },
  {
    q: "Есть бесплатный период?",
    a: "Тариф «Старт» бесплатный навсегда — 5 КП в месяц с калькулятором и PDF. Этого хватит чтобы оценить сервис.",
  },
];

export function FaqList() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {FAQS.map((faq, i) => (
        <div
          key={i}
          className={`rounded-2xl border bg-[#1A2332] transition-colors ${
            open === i ? "border-[rgba(37,99,235,0.4)]" : "border-[#334155]"
          }`}
        >
          <button
            className="flex w-full cursor-pointer items-center justify-between p-5 text-left text-[#F1F5F9] font-medium"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span>{faq.q}</span>
            <ChevronDown
              className="h-5 w-5 text-[#64748B] shrink-0 ml-4 transition-transform duration-200"
              style={{ transform: open === i ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          <div
            className="overflow-hidden transition-all duration-200"
            style={{ maxHeight: open === i ? "200px" : "0px" }}
          >
            <p className="px-5 pb-5 text-sm text-[#94A3B8] leading-relaxed">
              {faq.a}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
