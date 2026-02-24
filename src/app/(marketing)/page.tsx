import Link from "next/link";
import {
  Calculator,
  FileText,
  Palette,
  Zap,
  Shield,
  Share2,
  Check,
  MessageSquare,
  Mic,
  Camera,
  BarChart3,
  DollarSign,
  Clock,
} from "lucide-react";

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative py-24 md:py-36 px-4 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(37,99,235,0.15)_0%,transparent_60%)]" />

        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#334155] bg-[#1A2332] px-4 py-1.5 text-sm text-[#94A3B8] mb-6">
            <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
            Бесплатно для мастеров
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            Расчёт натяжного
            <br />
            потолка{" "}
            <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
              за 30 секунд
            </span>
          </h1>

          <p className="text-lg md:text-xl text-[#94A3B8] max-w-2xl mx-auto mb-10">
            Введите размеры комнат — получите расчёт 3 вариантов стоимости
            и красивое коммерческое предложение в PDF. Ваш бренд, ваши цены.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-8 py-4 text-base font-semibold text-white hover:shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:-translate-y-0.5 transition-all"
            >
              Попробовать бесплатно
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center justify-center rounded-xl border border-[#334155] px-8 py-4 text-base font-medium text-[#F1F5F9] hover:border-[#3B82F6] hover:text-[#3B82F6] transition-all"
            >
              Как это работает
            </Link>
          </div>

          {/* Social proof */}
          <div className="mt-12 flex items-center justify-center gap-3">
            <div className="flex -space-x-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-8 w-8 rounded-full border-2 border-[#0F1724] bg-gradient-to-br from-[#2563EB] to-[#3B82F6]"
                />
              ))}
            </div>
            <p className="text-sm text-[#94A3B8]">
              <span className="font-semibold text-[#F1F5F9]">150+</span> мастеров уже используют
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-4 border-t border-[#334155]/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Как это работает
          </h2>
          <p className="text-center text-[#94A3B8] mb-14 max-w-lg mx-auto">
            Три простых шага от размеров до готового КП
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: MessageSquare,
                title: "Введите размеры",
                desc: "Добавьте комнаты с размерами, типом потолка и количеством светильников",
              },
              {
                step: "02",
                icon: BarChart3,
                title: "ИИ рассчитает",
                desc: "Три варианта: Эконом, Стандарт и Премиум — с детализацией каждой позиции",
              },
              {
                step: "03",
                icon: FileText,
                title: "Получите КП",
                desc: "Красивое коммерческое предложение с вашим логотипом — готово к отправке",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-[#334155] bg-[#1A2332] p-6 hover:border-[rgba(37,99,235,0.4)] transition-colors group"
              >
                <span className="text-xs font-mono text-[#64748B] mb-4 block">
                  {item.step}
                </span>
                <item.icon className="h-8 w-8 text-[#3B82F6] mb-4 group-hover:text-[#F97316] transition-colors" />
                <h3 className="font-semibold text-lg mb-2 text-[#F1F5F9]">
                  {item.title}
                </h3>
                <p className="text-sm text-[#94A3B8]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="py-20 px-4 border-t border-[#334155]/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Возможности
          </h2>
          <p className="text-center text-[#94A3B8] mb-14">
            Всё что нужно мастеру натяжных потолков
          </p>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { icon: Calculator, title: "Мгновенный расчёт", desc: "3 варианта за секунды — Эконом, Стандарт, Премиум" },
              { icon: FileText, title: "PDF коммерческое предложение", desc: "5 страниц с профессиональным дизайном" },
              { icon: Palette, title: "Ваш бренд", desc: "Логотип, цвет, контакты — КП выглядит как ваше" },
              { icon: DollarSign, title: "Свои цены", desc: "Настройте 23 позиции под ваш прайс" },
              { icon: Share2, title: "Ссылка для клиента", desc: "Поделитесь КП одной ссылкой или в WhatsApp" },
              { icon: Shield, title: "Облачное хранение", desc: "Все расчёты сохранены и доступны всегда" },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6 hover:border-[rgba(37,99,235,0.4)] transition-all hover:bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.08)_0%,#1A2332_70%)]"
              >
                <feature.icon className="h-7 w-7 text-[#3B82F6] mb-3" />
                <h3 className="font-semibold mb-1.5 text-[#F1F5F9]">{feature.title}</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 border-t border-[#334155]/30 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)]" />
        <div className="container mx-auto max-w-3xl relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "150+", label: "мастеров" },
              { value: "2,000+", label: "расчётов" },
              { value: "30", label: "секунд" },
              { value: "98%", label: "точность" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl md:text-4xl font-bold font-mono text-[#F1F5F9]">
                  {stat.value}
                </p>
                <p className="text-sm text-[#94A3B8] mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 border-t border-[#334155]/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Простые тарифы
          </h2>
          <p className="text-center text-[#94A3B8] mb-14">
            Начните бесплатно, переходите на PRO когда будете готовы
          </p>

          <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6">
              <h3 className="font-bold text-xl mb-1 text-[#F1F5F9]">Старт</h3>
              <p className="text-3xl font-bold text-[#F1F5F9] mb-1">
                0 ₸
              </p>
              <p className="text-sm text-[#64748B] mb-6">бесплатно навсегда</p>
              <ul className="space-y-3 text-sm text-[#94A3B8] mb-6">
                {["5 КП в месяц", "3 варианта расчёта", "PDF скачивание", "Публичная ссылка"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#10B981] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full text-center rounded-xl border border-[#334155] py-3 text-sm font-medium text-[#F1F5F9] hover:border-[#3B82F6] transition-colors"
              >
                Начать
              </Link>
            </div>

            {/* Pro — highlighted */}
            <div className="rounded-2xl border-2 border-[#F97316] bg-[#1A2332] p-6 relative bg-[radial-gradient(ellipse_at_top,rgba(249,115,22,0.08)_0%,#1A2332_70%)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1 text-xs font-semibold text-white">
                  Популярный
                </span>
              </div>
              <h3 className="font-bold text-xl mb-1 text-[#F1F5F9]">Мастер</h3>
              <p className="text-3xl font-bold text-[#F1F5F9] mb-1">
                1 990 ₸
              </p>
              <p className="text-sm text-[#64748B] mb-6">в месяц</p>
              <ul className="space-y-3 text-sm text-[#94A3B8] mb-6">
                {["Безлимит КП", "Свои цены", "PDF с логотипом", "Приоритетная поддержка"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#10B981] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full text-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] py-3 text-sm font-semibold text-white hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all"
              >
                Попробовать
              </Link>
            </div>

            {/* Business */}
            <div className="rounded-2xl border border-[#334155] bg-[#1A2332] p-6">
              <h3 className="font-bold text-xl mb-1 text-[#F1F5F9]">Бизнес</h3>
              <p className="text-3xl font-bold text-[#F1F5F9] mb-1">
                4 990 ₸
              </p>
              <p className="text-sm text-[#64748B] mb-6">в месяц</p>
              <ul className="space-y-3 text-sm text-[#94A3B8] mb-6">
                {["Всё из Мастера", "Команда (5 чел)", "White-label КП", "API доступ"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#10B981] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/register"
                className="block w-full text-center rounded-xl border border-[#334155] py-3 text-sm font-medium text-[#F1F5F9] hover:border-[#3B82F6] transition-colors"
              >
                Связаться
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 border-t border-[#334155]/30">
        <div className="container mx-auto max-w-2xl">
          <h2 className="text-2xl md:text-4xl font-bold text-center mb-14">
            Частые вопросы
          </h2>
          <div className="space-y-4">
            {[
              { q: "Как начать пользоваться?", a: "Зарегистрируйтесь, добавьте комнаты в калькуляторе и получите расчёт за секунды." },
              { q: "Нужно ли устанавливать приложение?", a: "Нет, PotolokAI работает в браузере. Также есть Telegram-бот @PotolokAI_bot." },
              { q: "Как настроить свои цены?", a: "В разделе «Цены» вы можете изменить все 23 позиции: полотно, профили, споты и другое." },
              { q: "Можно ли отправить КП клиенту?", a: "Да! Каждое КП имеет уникальную ссылку, которой можно поделиться в WhatsApp или мессенджере." },
              { q: "Есть бесплатный период?", a: "Тариф «Старт» бесплатный навсегда — 5 КП в месяц. Этого хватит для начала." },
            ].map((faq) => (
              <details
                key={faq.q}
                className="group rounded-2xl border border-[#334155] bg-[#1A2332] transition-colors open:border-[rgba(37,99,235,0.3)]"
              >
                <summary className="flex cursor-pointer items-center justify-between p-5 text-[#F1F5F9] font-medium">
                  {faq.q}
                  <span className="text-[#64748B] group-open:rotate-45 transition-transform text-xl">
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm text-[#94A3B8] leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 text-center relative border-t border-[#334155]/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.08)_0%,transparent_60%)]" />
        <div className="container mx-auto max-w-2xl relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Попробуйте{" "}
            <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">
              бесплатно
            </span>
          </h2>
          <p className="text-[#94A3B8] mb-10 text-lg">
            Присоединяйтесь к мастерам, которые уже экономят время на расчётах
          </p>
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] px-10 py-4 text-lg font-semibold text-white hover:shadow-[0_0_50px_rgba(249,115,22,0.4)] hover:-translate-y-1 transition-all"
          >
            Начать бесплатно
          </Link>
        </div>
      </section>
    </div>
  );
}
