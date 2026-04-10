import {
  Calculator,
  FileText,
  Shield,
  Share2,
  Check,
  MessageSquare,
  Send,
  DollarSign,
  Zap,
  ClipboardCheck,
  Bot,
  Bell,
  Layers,
  Ruler,
  Smartphone,
  Camera,
  Star,
} from "lucide-react";
import { FaqList } from "./faq-list";

export default function HomePage() {
  return (
    <div className="relative">
      {/* Global keyframes + dot grid via style tag */}
      <style>{`
        @keyframes orb-drift-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(40px, -30px) scale(1.08); }
          66% { transform: translate(-20px, 20px) scale(0.94); }
        }
        @keyframes orb-drift-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(-30px, 25px) scale(0.93); }
          66% { transform: translate(25px, -20px) scale(1.07); }
        }
        @keyframes orb-drift-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.05); }
        }
        .orb-1 { animation: orb-drift-1 14s ease-in-out infinite; }
        .orb-2 { animation: orb-drift-2 18s ease-in-out infinite; }
        .orb-3 { animation: orb-drift-3 22s ease-in-out infinite; }
        .dot-grid {
          background-image: radial-gradient(circle, #334155 1px, transparent 1px);
          background-size: 28px 28px;
        }
      `}</style>

      {/* Hero */}
      <section className="relative py-20 md:py-32 px-4 overflow-hidden">
        {/* Orb 1 — blue, top-left */}
        <div className="orb-1 absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-blue-600/18 blur-[120px] pointer-events-none" />
        {/* Orb 2 — orange, top-right */}
        <div className="orb-2 absolute -top-16 -right-16 w-[420px] h-[420px] rounded-full bg-orange-500/14 blur-[100px] pointer-events-none" />
        {/* Orb 3 — indigo, bottom-center */}
        <div className="orb-3 absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

        {/* Dot grid overlay */}
        <div className="dot-grid absolute inset-0 opacity-20 pointer-events-none" />

        {/* Horizontal glow line at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

        <div className="container mx-auto max-w-5xl relative z-10">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* Left: text */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#334155] bg-[#1A2332] px-4 py-1.5 text-sm text-[#94A3B8] mb-6">
                <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
                Бесплатно для мастеров
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-5 leading-[1.1]">
                Калькулятор
                <br />
                натяжных потолков{" "}
                <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
                  для мастеров
                </span>
              </h1>

              <p className="text-base md:text-lg text-[#94A3B8] mb-8 leading-relaxed">
                Рассчитайте стоимость за минуту, сформируйте КП с вашим брендом и
                сгенерируйте договор — всё в одном сервисе. Казахстан.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="/auth/register"
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-7 py-3.5 text-base font-semibold text-white hover:shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:-translate-y-0.5 transition-all"
                >
                  Попробовать бесплатно
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center rounded-xl border border-[#334155] px-7 py-3.5 text-base font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:text-[#3B82F6] transition-all"
                >
                  Как это работает
                </a>
              </div>
            </div>

            {/* Right: KP mockup */}
            <div className="relative">
              {/* Glow behind card */}
              <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-3xl scale-110" />

              <div className="relative rounded-2xl border border-[#334155] bg-[#1A2332] p-5 shadow-2xl shadow-blue-500/10">
                {/* KP header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#F97316] to-[#FB923C] flex items-center justify-center text-white text-xs font-bold">
                      МП
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#F1F5F9]">Мастер Потолков</p>
                      <p className="text-[10px] text-[#64748B]">Коммерческое предложение</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#64748B]">27.02.2026</span>
                </div>

                {/* KP rooms */}
                <div className="space-y-2 mb-4">
                  <div className="rounded-lg bg-[#0F1724] p-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[#94A3B8] font-medium">Гостиная — 18.5 м²</span>
                      <span className="text-[#F1F5F9] font-semibold">87 400 ₸</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] text-[#64748B]">Полотно мат</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] text-[#64748B]">Профиль теневой</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] text-[#64748B]">6 спотов</span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#0F1724] p-3">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[#94A3B8] font-medium">Спальня — 14.2 м²</span>
                      <span className="text-[#F1F5F9] font-semibold">62 800 ₸</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] text-[#64748B]">Полотно сатин</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] text-[#64748B]">4 спота</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2332] text-[#64748B]">Гардина 280 см</span>
                    </div>
                  </div>
                </div>

                {/* KP total */}
                <div className="flex justify-between items-center pt-3 border-t border-[#334155]">
                  <span className="text-xs text-[#94A3B8]">Итого (32.7 м²)</span>
                  <span className="text-lg font-bold text-[#F97316]">150 200 ₸</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <div className="flex-1 rounded-lg bg-[#0F1724] py-2 text-center text-[10px] text-[#64748B] flex items-center justify-center gap-1">
                    <Share2 className="h-3 w-3" /> WhatsApp
                  </div>
                  <div className="flex-1 rounded-lg bg-[#0F1724] py-2 text-center text-[10px] text-[#64748B] flex items-center justify-center gap-1">
                    <FileText className="h-3 w-3" /> Договор
                  </div>
                  <div className="flex-1 rounded-lg bg-gradient-to-r from-[#F97316] to-[#FB923C] py-2 text-center text-[10px] text-white font-medium flex items-center justify-center gap-1">
                    <Send className="h-3 w-3" /> Отправить
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div className="absolute -top-3 -right-3 md:-right-6 rounded-full bg-[#10B981] text-white text-[10px] font-bold px-3 py-1.5 shadow-lg shadow-emerald-500/30">
                Готово за 60 сек
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative py-20 px-4 border-t border-[#334155]/30 overflow-hidden">
        {/* Subtle blue glow left */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-64 h-64 bg-blue-600/8 blur-[100px] rounded-full pointer-events-none" />

        <div className="container mx-auto max-w-4xl relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Как это работает
          </h2>
          <p className="text-center text-[#94A3B8] mb-14 max-w-lg mx-auto">
            От размеров до договора — за 4 простых шага
          </p>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                step: "01",
                icon: MessageSquare,
                title: "Добавьте комнаты",
                desc: "Укажите размеры, тип потолка, споты, люстры, карниз, гардину",
              },
              {
                step: "02",
                icon: Calculator,
                title: "Получите расчёт",
                desc: "Точная стоимость с вашими ценами — все комплектующие подобраны",
              },
              {
                step: "03",
                icon: Send,
                title: "Отправьте КП",
                desc: "Красивая ссылка с вашим брендом — клиент подтвердит онлайн",
              },
              {
                step: "04",
                icon: ClipboardCheck,
                title: "Скачайте договор",
                desc: "Готовый договор и акт с реквизитами — распечатайте и подпишите",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-[#334155] bg-[#1A2332] p-5 hover:border-blue-500/40 hover:bg-[#1e2d45] transition-all group"
              >
                <span className="text-xs font-mono text-[#64748B] mb-3 block">
                  {item.step}
                </span>
                <item.icon className="h-7 w-7 text-[#3B82F6] mb-3 group-hover:text-[#F97316] transition-colors" />
                <h3 className="font-semibold text-base mb-1.5 text-[#F1F5F9]">
                  {item.title}
                </h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Measurements Feature Highlight */}
      <section className="relative py-20 px-4 border-t border-[#334155]/30 overflow-hidden">
        <div className="orb-3 absolute left-1/3 top-0 w-96 h-96 rounded-full bg-emerald-500/8 blur-[120px] pointer-events-none" />

        <div className="container mx-auto max-w-5xl relative z-10">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* Left: Phone mockup */}
            <div className="relative mx-auto max-w-[280px] md:max-w-none">
              <div className="absolute inset-0 bg-emerald-500/10 blur-3xl rounded-3xl scale-110" />
              <div className="relative rounded-[2rem] border-2 border-[#334155] bg-[#1A2332] p-3 shadow-2xl">
                <div className="rounded-[1.5rem] bg-[#0F1724] overflow-hidden">
                  {/* Status bar */}
                  <div className="flex justify-between items-center px-4 py-2 text-[9px] text-[#64748B]">
                    <span>9:41</span>
                    <div className="w-20 h-5 bg-[#1A2332] rounded-full" />
                    <span>100%</span>
                  </div>
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-[#334155]/50">
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-[#10B981]" />
                      <span className="text-sm font-semibold text-[#F1F5F9]">Замеры</span>
                    </div>
                    <p className="text-[10px] text-[#64748B] mt-0.5">ул. Абая 45, кв. 12</p>
                  </div>
                  {/* Rooms list */}
                  <div className="p-3 space-y-2">
                    {[
                      { name: "Гостиная", area: "22.4 м²", walls: "5.2 · 4.3 · 5.2 · 4.3", photos: 3 },
                      { name: "Спальня", area: "15.1 м²", walls: "4.1 · 3.7 · 4.1 · 3.7", photos: 2 },
                      { name: "Кухня", area: "11.8 м²", walls: "3.5 · 3.4 · 3.5 · 3.4", photos: 1 },
                    ].map((room) => (
                      <div key={room.name} className="rounded-lg bg-[#1A2332] p-2.5">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#F1F5F9] font-medium">{room.name}</span>
                          <span className="text-[#10B981] font-semibold">{room.area}</span>
                        </div>
                        <p className="text-[9px] text-[#64748B]">Стены: {room.walls} м</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Camera className="h-2.5 w-2.5 text-[#64748B]" />
                          <span className="text-[9px] text-[#64748B]">{room.photos} фото</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Bottom action */}
                  <div className="px-3 pb-4">
                    <div className="rounded-lg bg-gradient-to-r from-[#10B981] to-[#059669] py-2 text-center text-[10px] text-white font-medium">
                      Создать КП из замеров
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -top-3 -right-3 rounded-full bg-[#10B981] text-white text-[10px] font-bold px-3 py-1.5 shadow-lg shadow-emerald-500/30">
                + фото
              </div>
            </div>

            {/* Right: text */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-[#10B981] mb-6">
                <Smartphone className="h-3.5 w-3.5" />
                Работает на телефоне
              </div>

              <h2 className="text-2xl md:text-4xl font-bold mb-5 leading-tight">
                Замеряйте{" "}
                <span className="bg-gradient-to-r from-[#10B981] to-[#059669] bg-clip-text text-transparent">
                  на объекте
                </span>
                <br />
                — КП создаётся само
              </h2>

              <div className="space-y-4 text-[#94A3B8]">
                {[
                  { icon: Ruler, text: "Вводите размеры стен прямо на объекте — любые формы и углы" },
                  { icon: Camera, text: "Фотографируйте каждую комнату — фото прикрепляются к замеру" },
                  { icon: Calculator, text: "Одна кнопка — и замеры превращаются в готовое КП с ценами" },
                  { icon: Bell, text: "Клиент откроет КП — вам придёт уведомление в Telegram" },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3">
                    <div className="rounded-lg bg-emerald-500/10 p-2 shrink-0">
                      <item.icon className="h-4 w-4 text-[#10B981]" />
                    </div>
                    <p className="text-sm leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>

              <a
                href="/auth/register"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] px-7 py-3.5 text-base font-semibold text-white hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all mt-8"
              >
                Попробовать замеры
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-20 px-4 border-t border-[#334155]/30 overflow-hidden">
        {/* Orb right side */}
        <div className="orb-1 absolute -right-32 top-1/3 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

        {/* Dot grid */}
        <div className="dot-grid absolute inset-0 opacity-10 pointer-events-none" />

        <div className="container mx-auto max-w-4xl relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Всё что нужно мастеру
          </h2>
          <p className="text-center text-[#94A3B8] mb-14">
            Инструменты, которые экономят время и повышают доверие клиентов
          </p>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                icon: Calculator,
                title: "Калькулятор 28+ позиций",
                desc: "Полотно, профиль, споты, люстры, карниз, гардина, подшторник, трубы и ваши позиции",
              },
              {
                icon: FileText,
                title: "КП с вашим брендом",
                desc: "Логотип, цвет, контакты — клиент получает профессиональное предложение",
              },
              {
                icon: ClipboardCheck,
                title: "Авто-договор",
                desc: "Готовый договор и акт с вашими реквизитами — для ИП и физлиц",
              },
              {
                icon: DollarSign,
                title: "Свои цены",
                desc: "Настройте каждую позицию + добавляйте кастомные позиции в прайс",
              },
              {
                icon: Bot,
                title: "AI-ассистент",
                desc: "Загрузите фото замера — ИИ извлечёт размеры и рассчитает стоимость",
              },
              {
                icon: Share2,
                title: "Ссылка для клиента",
                desc: "Клиент видит КП онлайн, подтверждает — вы получаете уведомление",
              },
              {
                icon: Ruler,
                title: "Замеры на объекте",
                desc: "Замеряйте прямо с телефона — стены, углы, фото комнат. Одна кнопка → КП",
              },
              {
                icon: Bell,
                title: "Telegram уведомления",
                desc: "Клиент открыл КП или подтвердил — мгновенное оповещение",
              },
              {
                icon: Layers,
                title: "Сложные формы",
                desc: "Г-образные и Т-образные потолки с точным расчётом площади",
              },
              {
                icon: Smartphone,
                title: "Мобильное приложение",
                desc: "Работает на iPhone и Android. Все функции — прямо в кармане",
              },
              {
                icon: Shield,
                title: "Облако + история",
                desc: "Все расчёты сохранены. Пересчитайте или скопируйте в один клик",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-[#334155] bg-[#1A2332] p-5 hover:border-blue-500/40 hover:bg-[#1e2d45] transition-all"
              >
                <feature.icon className="h-6 w-6 text-[#3B82F6] mb-3" />
                <h3 className="font-semibold mb-1 text-[#F1F5F9] text-sm">{feature.title}</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative py-16 px-4 border-t border-[#334155]/30 overflow-hidden">
        {/* Full-width center glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.12)_0%,transparent_65%)] pointer-events-none" />
        {/* Top + bottom gradient lines */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/25 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/25 to-transparent" />

        <div className="container mx-auto max-w-3xl relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { value: "28+", label: "позиций расчёта", sub: "включая кастомные" },
              { value: "60с", label: "на полный расчёт", sub: "несколько комнат" },
              { value: "1 клик", label: "договор", sub: "с реквизитами" },
              { value: "24/7", label: "доступ", sub: "с любого устройства" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold font-mono text-[#F1F5F9]">
                  {stat.value}
                </p>
                <p className="text-sm text-[#94A3B8] mt-1">{stat.label}</p>
                <p className="text-[10px] text-[#64748B] mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative py-20 px-4 border-t border-[#334155]/30 overflow-hidden">
        {/* Orange glow behind PRO card */}
        <div className="orb-2 absolute right-1/4 top-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-orange-500/10 blur-[100px] pointer-events-none" />

        <div className="container mx-auto max-w-3xl relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Простые тарифы
          </h2>
          <p className="text-center text-[#94A3B8] mb-14">
            Начните бесплатно — переходите на PRO когда будете готовы
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6">
              <h3 className="font-bold text-xl mb-1 text-[#F1F5F9]">Старт</h3>
              <p className="text-3xl font-bold text-[#F1F5F9] mb-1">0 ₸</p>
              <p className="text-sm text-[#64748B] mb-6">бесплатно навсегда</p>
              <ul className="space-y-3 text-sm text-[#94A3B8] mb-6">
                {[
                  "5 КП в месяц",
                  "Калькулятор 28+ позиций",
                  "Публичная ссылка КП",
                  "PDF скачивание",
                  "Сложные формы (Г/Т)",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#10B981] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/auth/register"
                className="block w-full text-center rounded-xl border border-[#334155] py-3 text-sm font-medium text-[#F1F5F9] hover:border-[#3B82F6] transition-colors"
              >
                Начать бесплатно
              </a>
            </div>

            {/* Pro — highlighted */}
            <div className="rounded-2xl border-2 border-[#F97316] bg-[#1A2332] p-6 relative overflow-hidden">
              {/* Inner glow */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.1)_0%,transparent_65%)] pointer-events-none" />

              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-orange-500/30">
                  Популярный
                </span>
              </div>
              <h3 className="font-bold text-xl mb-1 text-[#F1F5F9] relative z-10">Мастер PRO</h3>
              <p className="text-3xl font-bold text-[#F1F5F9] mb-1 relative z-10">1 990 ₸</p>
              <p className="text-sm text-[#64748B] mb-6 relative z-10">в месяц</p>
              <ul className="space-y-3 text-sm text-[#94A3B8] mb-6 relative z-10">
                {[
                  "Безлимит КП",
                  "Свои цены + кастомные позиции",
                  "Авто-договор и акт",
                  "AI-ассистент",
                  "Telegram уведомления",
                  "Брендинг (лого, цвет)",
                  "Приоритетная поддержка",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#10B981] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/auth/register"
                className="relative z-10 block w-full text-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] py-3 text-sm font-semibold text-white hover:shadow-[0_0_30px_rgba(249,115,22,0.35)] transition-all"
              >
                Попробовать бесплатно
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative py-20 px-4 border-t border-[#334155]/30 overflow-hidden">
        <div className="orb-2 absolute right-0 top-1/3 w-72 h-72 rounded-full bg-blue-500/8 blur-[100px] pointer-events-none" />

        <div className="container mx-auto max-w-4xl relative z-10">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Мастера уже используют
          </h2>
          <p className="text-center text-[#94A3B8] mb-14">
            Отзывы от мастеров натяжных потолков Казахстана
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                name: "Арман",
                city: "Астана",
                text: "Раньше считал в Excel — терял по часу на каждого клиента. Теперь отправляю КП прямо с объекта за 2 минуты. Клиенты удивляются скорости.",
                rating: 5,
              },
              {
                name: "Бауыржан",
                city: "Алматы",
                text: "AI ассистент — это огонь. Скинул фото чертежа — он сам всё посчитал. Договор генерируется автоматом. Экономлю кучу времени.",
                rating: 5,
              },
              {
                name: "Дмитрий",
                city: "Караганда",
                text: "Замеры на телефоне — то что не хватало. Приехал на объект, замерил все комнаты, сфоткал, нажал кнопку — КП готово. Клиент подтвердил по ссылке.",
                rating: 5,
              },
            ].map((review) => (
              <div
                key={review.name}
                className="rounded-2xl border border-[#334155] bg-[#1A2332] p-5 hover:border-blue-500/40 transition-all"
              >
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-[#F97316] text-[#F97316]" />
                  ))}
                </div>
                <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                  &ldquo;{review.text}&rdquo;
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold">
                    {review.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#F1F5F9]">{review.name}</p>
                    <p className="text-[10px] text-[#64748B]">{review.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 border-t border-[#334155]/30">
        <div className="container mx-auto max-w-2xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-14">
            Частые вопросы
          </h2>
          <FaqList />
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 px-4 text-center border-t border-[#334155]/30 overflow-hidden">
        {/* Big orange + blue orbs */}
        <div className="orb-1 absolute -left-20 top-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-blue-600/12 blur-[100px] pointer-events-none" />
        <div className="orb-2 absolute -right-20 top-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-orange-500/12 blur-[100px] pointer-events-none" />
        {/* Center radial */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.07)_0%,transparent_55%)] pointer-events-none" />

        <div className="container mx-auto max-w-2xl relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Считайте{" "}
            <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
              быстрее
            </span>
          </h2>
          <p className="text-[#94A3B8] mb-8 text-lg">
            Присоединяйтесь к мастерам Казахстана, которые уже экономят
            время на расчётах и производят впечатление на клиентов
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/auth/register"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-10 py-4 text-lg font-semibold text-white hover:shadow-[0_0_50px_rgba(249,115,22,0.4)] hover:-translate-y-1 transition-all"
            >
              <Zap className="h-5 w-5 mr-2" />
              Начать бесплатно
            </a>
          </div>
          <p className="text-xs text-[#64748B] mt-4">
            Регистрация за 30 секунд. Без карты. 5 КП бесплатно каждый месяц.
          </p>
        </div>
      </section>
    </div>
  );
}
