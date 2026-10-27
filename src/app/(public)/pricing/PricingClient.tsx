"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { BillingStatus } from "@/lib/billing-client";
import { formatMoney, type CurrencyCode } from "@/lib/currency";

type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";
type Period = "month" | "year";

type Config = {
  kaspiPhone: string;
  kaspiReceiverName: string;
  /** Валюта цен: RUB — мастер из России, платит переводом (27.10.2026). */
  currency: CurrencyCode;
  priceMonth: number;
  priceYear: number;
  launchPriceMonth: number;
  launchPriceUntil: string;
  freeObjects: number;
  billingEnabled: boolean;
  /** Кнопки оплаты показываем (может быть раньше включения лимитов). */
  paymentsOpen: boolean;
  /** Оплата картой через виджет TipTop настроена. */
  cardEnabled: boolean;
};

// Виджет TipTop Pay: скрипт грузим только с их домена и только когда нажали «картой».
// status: success | fail | cancel…; номер транзакции — в data.transactionId.
type TiptopResult = { type: string; status: string; data?: { transactionId?: number } };
declare global {
  interface Window {
    tiptop?: {
      Widget: new () => {
        start: (params: Record<string, unknown>) => Promise<TiptopResult>;
        oncomplete?: (result: TiptopResult) => void;
      };
    };
  }
}

let tiptopScript: Promise<void> | null = null;
function loadTiptopWidget(): Promise<void> {
  if (window.tiptop) return Promise.resolve();
  if (!tiptopScript) {
    tiptopScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://widget.tiptoppay.kz/bundles/widget.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { tiptopScript = null; reject(new Error("widget load failed")); };
      document.head.appendChild(s);
    });
  }
  return tiptopScript;
}

type AuthedMaster = {
  id: string;
  firstName: string;
  isOwner: boolean;
  status: BillingStatus;
};

type RecentPayment = {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  days: number;
  card: boolean;
};

type Props =
  | { mode: "public"; config: Config; master: null }
  | { mode: "authed"; config: Config; master: AuthedMaster; recentPayments: RecentPayment[] };

// Явная зона: сервер Vercel живёт в UTC, и «23 ноября 00:00 Алматы» там ещё
// 22-е — без timeZone сервер и браузер рисуют разные даты (hydration #418).
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });
}

// Граница «1 января 00:00» → людям показываем «31 декабря».
function fmtLastDay(iso: string): string {
  return new Date(new Date(iso).getTime() - 1).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });
}

function statusBadge(s: PaymentStatus, card = false) {
  if (s === "APPROVED") return <Badge className="bg-green-600 hover:bg-green-600">Активирована</Badge>;
  if (s === "REJECTED") return <Badge variant="destructive">Отклонена</Badge>;
  return <Badge variant="secondary">{card ? "Не оплачена" : "На проверке"}</Badge>;
}

const FREE_FEATURES = [
  "Замер с телефона и лазерной рулеткой",
  "Чертёж, расчёт, КП в PDF",
  "Все готовые объекты, КП и договоры открыты всегда",
  "Учёт денег по объектам",
];

const PRO_FEATURES = [
  "Объекты без ограничений",
  "Договор и акт с подписью клиента",
  "КП ссылкой с вашим брендом",
  "3D-потолок и фото клиенту",
  "ИИ-помощник и ИИ-логотип",
  "Отправка в цех, клиенты, напоминания",
];

export function PricingClient(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const cfg = props.config;
  const fmt = (n: number) => formatMoney(n, cfg.currency);
  // Из России: карты РФ через TipTop не проходят, Kaspi у них нет — только
  // перевод на карту Kaspi (Золотая Корона по номеру, Сбер / Т-Банк «в Казахстан»).
  const fromRf = cfg.currency === "RUB";
  const master = props.mode === "authed" ? props.master : null;
  const recentPayments = props.mode === "authed" ? props.recentPayments : [];

  // Стартовая цена (до 31.12.2026) — одна для всех и только помесячно:
  // ничего на год не фиксируем (решение 14.10). После — месяц/год по обычной.
  const launchOpen = Date.now() < new Date(cfg.launchPriceUntil).getTime();
  const priceMonth = launchOpen ? cfg.launchPriceMonth : cfg.priceMonth;
  const priceYear = cfg.priceYear;

  const [period, setPeriod] = useState<Period>(launchOpen ? "month" : "year");
  const [payOpen, setPayOpen] = useState(false);
  const [step, setStep] = useState<"instruction" | "form">("instruction");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [method, setMethod] = useState<"transfer" | "invoice" | "card">("transfer");
  const [cardPaidUntil, setCardPaidUntil] = useState<string | null>(null);

  const amountToPay = period === "year" && !launchOpen ? priceYear : priceMonth;

  function openPay(p: Period) {
    setPeriod(p);
    setStep("instruction");
    setReceiptFile(null);
    setComment("");
    setError(null);
    setSubmittedId(null);
    setPayOpen(true);
  }

  async function handleSubmit(m: "transfer" | "invoice" = "transfer") {
    setError(null);
    setSubmitting(true);
    setMethod(m);
    try {
      let url: string | null = null;
      if (m === "transfer" && receiptFile) {
        const fd = new FormData();
        fd.append("file", receiptFile);
        const up = await fetch("/api/payment/upload-receipt", { method: "POST", body: fd });
        const upData = await up.json();
        if (!up.ok) {
          setError(upData.error || "Ошибка загрузки чека");
          return;
        }
        url = upData.url as string;
      }
      const res = await fetch("/api/payment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshotUrl: url, comment, period, method: m }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось отправить заявку");
        return;
      }
      setSubmittedId(data.id);
      startTransition(() => router.refresh());
    } catch {
      setError("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Картой: заявка на сервере → виджет TipTop → сервер сам проверяет
   * транзакцию у TipTop и включает PRO. Карту видит только TipTop.
   */
  async function payByCard() {
    setError(null);
    setSubmitting(true);
    setMethod("card");
    try {
      const res = await fetch("/api/payment/tiptop/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось начать оплату");
        return;
      }
      await loadTiptopWidget();
      if (!window.tiptop) throw new Error("widget missing");
      const widget = new window.tiptop.Widget();

      // Подтверждаем у нашего сервера один раз: oncomplete приходит сразу по
      // итогу транзакции, а промис start() — только когда мастер закроет
      // виджет (после успеха TipTop показывает свой экран «бонус»).
      let confirmed = false;
      const confirm = async (result: TiptopResult) => {
        if (confirmed) return;
        confirmed = true;
        const conf = await fetch("/api/payment/tiptop/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentId: data.paymentId, transactionId: result.data?.transactionId }),
        });
        const confData = await conf.json();
        if (!conf.ok || !confData.ok) {
          // Деньги могли списаться, а подтверждение задержаться — PRO включит уведомление TipTop.
          setError(confData.error || "Оплата прошла, но подтверждение задерживается. PRO включится в течение нескольких минут.");
          return;
        }
        setCardPaidUntil(confData.paidUntil ?? null);
        setSubmittedId(data.paymentId);
        startTransition(() => router.refresh());
      };
      widget.oncomplete = (result) => {
        if (result.status === "success") void confirm(result).catch(() => {});
      };

      const result = await widget.start({
        publicTerminalId: data.publicId,
        amount: data.amount,
        currency: "KZT",
        paymentSchema: "Single",
        description: data.description,
        externalId: data.paymentId,
        culture: "ru-RU",
        skin: "modern",
        emailBehavior: "Optional",
        // Секунды до автозакрытия после успеха (3–10), иначе виджет висит с экраном «бонус».
        autoClose: 3,
        receiptEmail: data.email ?? undefined,
        userInfo: { accountId: data.accountId, email: data.email ?? undefined },
        metadata: { paymentId: data.paymentId, masterId: data.accountId },
      });
      if (result.type === "cancel" || result.status === "cancel") return;
      if (result.status !== "success") {
        setError("Банк не пропустил оплату. Попробуйте другую карту или перевод Kaspi.");
        return;
      }
      await confirm(result);
    } catch (err) {
      console.error("payByCard failed:", err);
      setError("Не удалось открыть оплату картой. Можно оплатить переводом Kaspi ниже.");
    } finally {
      setSubmitting(false);
    }
  }

  const s = master?.status;
  const canPay = cfg.paymentsOpen && !!master && !master.isOwner;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold">Сколько стоит PotolokAI</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          Первые {cfg.freeObjects} объектов — бесплатно, без карты и без срока. Дальше — PRO за{" "}
          {fmt(priceMonth)} в месяц{launchOpen ? ` — стартовая цена до ${fmtLastDay(cfg.launchPriceUntil)}` : ": меньше 3% одного заказа"}.
        </p>
        {!cfg.billingEnabled && (
          <p className="mt-3 inline-block rounded-full bg-sky-100 text-sky-900 text-sm px-4 py-1">
            {cfg.paymentsOpen
              ? "Лимиты пока не включены — работайте свободно. Оплатить PRO уже можно."
              : "Сейчас всё бесплатно. Цены ниже начнут действовать позже — предупредим заранее."}
          </p>
        )}
      </div>

      {/* Статус мастера */}
      {master && s && (
        <Card className="mb-6 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">Ваш тариф</span>
                {master.isOwner && <Badge>Owner</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {s.proReason === "paid" && s.paidUntil ? (
                  <>PRO до <b>{fmtDate(s.paidUntil)}</b></>
                ) : s.proReason === "owner" ? (
                  <>Владелец сервиса</>
                ) : s.announce ? (
                  <>С <b>{fmtDate(s.launchAt)}</b> — первые {s.objectsLimit} объектов бесплатно, дальше PRO. Сейчас всё бесплатно.</>
                ) : !s.enforced ? (
                  <>Сейчас всё бесплатно. PRO — по желанию.</>
                ) : s.graceUsed ? (
                  <>Бесплатные объекты и объект в долг использованы — новые объекты на PRO. Старое открыто.</>
                ) : s.inGrace ? (
                  <>Бесплатные {s.objectsLimit} использованы, следующий объект — в долг. Старое открыто.</>
                ) : (
                  <>Бесплатный тариф: объектов <b>{s.objectsUsed} из {s.objectsLimit}</b></>
                )}
              </div>
            </div>
            {launchOpen && !master.isOwner && (
              <div className="text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
                До {fmtLastDay(cfg.launchPriceUntil)} — {fmt(cfg.launchPriceMonth)}/мес. Дальше — {fmt(cfg.priceMonth)}.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Тарифы */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">Бесплатно</h2>
            <Badge variant="secondary">Для начала</Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{fmt(0)}</div>
          <div className="text-sm text-muted-foreground mb-4">первые {cfg.freeObjects} объектов</div>
          <ul className="text-sm space-y-2 mb-6">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />{f}</li>
            ))}
          </ul>
          {!master && (
            <Button asChild variant="outline" className="w-full" size="lg">
              <Link href="/auth/register">Начать бесплатно</Link>
            </Button>
          )}
        </Card>

        <Card className="p-6 border-2 border-primary relative">
          {launchOpen && (
            <span className="absolute -top-3 left-5 rounded-full bg-amber-500 text-black text-xs font-semibold px-3 py-1">
              Стартовая цена до {fmtLastDay(cfg.launchPriceUntil)}
            </span>
          )}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">PRO</h2>
            <Badge>Для работы</Badge>
          </div>

          {/* Переключатель периода — только после стартовой цены: на год не фиксируем */}
          {!launchOpen && (
            <div className="inline-flex rounded-lg border p-1 mb-3 text-sm">
              <button
                type="button"
                onClick={() => setPeriod("month")}
                className={`px-3 py-1 rounded-md ${period === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Месяц
              </button>
              <button
                type="button"
                onClick={() => setPeriod("year")}
                className={`px-3 py-1 rounded-md ${period === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Год · −33%
              </button>
            </div>
          )}

          <div className="text-3xl font-bold">{fmt(amountToPay)}</div>
          <div className="text-sm text-muted-foreground mb-4">
            {launchOpen
              ? `в месяц — для первых мастеров до ${fmtLastDay(cfg.launchPriceUntil)}. Дальше — ${fmt(cfg.priceMonth)} в месяц`
              : period === "year"
                ? `за год — это ${fmt(Math.round(priceYear / 12))} в месяц`
                : "в месяц"}
          </div>
          <ul className="text-sm space-y-2 mb-6">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />{f}</li>
            ))}
          </ul>
          {canPay ? (
            <Button className="w-full" size="lg" onClick={() => openPay(period)}>
              Оплатить {fmt(amountToPay)}
            </Button>
          ) : master ? (
            <Button className="w-full" size="lg" variant="secondary" disabled>
              {master.isOwner ? "Вы владелец" : "Оплата откроется позже"}
            </Button>
          ) : (
            <Button asChild className="w-full" size="lg">
              <Link href="/auth/register">Зарегистрироваться</Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {fromRf ? "Перевод из России за 5 минут." : "Kaspi или карта."} Без автосписания — продлеваете сами, когда удобно.
          </p>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground text-center max-w-2xl mx-auto mb-8">
        Что бы ни случилось с подпиской, ваши замеры, КП и договоры остаются открытыми: посмотреть,
        скачать, отправить клиенту. Ограничивается только создание новых объектов сверх бесплатных.
      </p>

      {/* История заявок */}
      {master && recentPayments.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-medium mb-3">Последние заявки</h3>
          <div className="space-y-2 text-sm">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <div className="font-medium">{formatMoney(p.amount, p.currency)} · {p.days >= 365 ? "год" : "месяц"}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</div>
                </div>
                {statusBadge(p.status, p.card)}
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        <Link href="/terms" className="underline">Договор-оферта</Link> ·{" "}
        <Link href="/refund" className="underline">Возврат и отмена</Link> ·{" "}
        <Link href="/privacy" className="underline">Конфиденциальность</Link>
      </p>

      {/* Оплата */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          {submittedId ? (
            <div className="py-4">
              <DialogHeader>
                <DialogTitle>{method === "card" ? "✅ Оплата прошла" : "✅ Заявка отправлена"}</DialogTitle>
                <DialogDescription>
                  {method === "card"
                    ? `PRO включён${cardPaidUntil ? ` до ${fmtDate(cardPaidUntil)}` : ""} Спасибо, что с нами!`
                    : method === "invoice"
                      ? "Счёт придёт в ваш Kaspi в ближайшее время, обычно в течение часа. Оплатите его — и PRO включится, придёт уведомление в приложение."
                      : "Проверим перевод и включим PRO — обычно в течение часа. Придёт уведомление в приложение."}
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full mt-4" onClick={() => setPayOpen(false)}>Понятно</Button>
            </div>
          ) : step === "instruction" ? (
            <>
              <DialogHeader>
                <DialogTitle>PRO на {period === "year" && !launchOpen ? "год" : "месяц"} — {fmt(amountToPay)}</DialogTitle>
                <DialogDescription>
                  {fromRf
                    ? "Карты банков России через нашу платёжку не проходят. Переведите на карту Kaspi по номеру ниже и загрузите чек — PRO включим после проверки, обычно в течение часа."
                    : cfg.cardEnabled
                      ? "Картой — PRO включится сразу. Или переводом Kaspi: переведите на номер ниже и загрузите чек, либо попросите счёт."
                      : "Переведите по Kaspi на номер ниже и загрузите скрин чека — или попросите счёт, он придёт прямо в ваш Kaspi."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {cfg.cardEnabled && (
                  <Button className="w-full" size="lg" disabled={submitting} onClick={payByCard}>
                    {submitting && method === "card" ? "Открываем оплату…" : `💳 Оплатить картой ${fmt(amountToPay)}`}
                  </Button>
                )}
                <div className="rounded-lg bg-muted p-4 space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Сумма</div>
                    <div className="text-2xl font-bold">{fmt(amountToPay)}</div>
                    {fromRf && <div className="text-xs text-muted-foreground">в рублях — получателю придут тенге по курсу перевода</div>}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{fromRf ? "Номер телефона получателя (карта Kaspi, Казахстан)" : "Номер для Kaspi-перевода"}</div>
                    <div className="text-lg font-mono font-semibold select-all">{cfg.kaspiPhone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Получатель</div>
                    <div>{cfg.kaspiReceiverName}</div>
                  </div>
                  {fromRf ? (
                    <div>
                      <div className="text-xs text-muted-foreground">Как перевести из России</div>
                      <ol className="text-sm list-decimal pl-4 space-y-1 mt-1">
                        <li>
                          <b>Золотая Корона</b> (koronapay.com или приложение «Золотая Корона — Денежные переводы»): перевод в Казахстан на карту Kaspi по номеру телефона. Приходит за минуты.
                        </li>
                        <li>
                          <b>Сбер или Т-Банк</b>: «Перевод за рубеж → Казахстан» на карту Kaspi по номеру телефона.
                        </li>
                      </ol>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs text-muted-foreground">В комментарии перевода</div>
                      <div className="text-sm">укажите телефон от аккаунта</div>
                    </div>
                  )}
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter className="flex-col sm:flex-col gap-2">
                <Button className="w-full" variant={cfg.cardEnabled ? "outline" : "default"} onClick={() => setStep("form")}>Я перевёл → загрузить чек</Button>
                {!fromRf && (
                  <Button className="w-full" variant="secondary" disabled={submitting} onClick={() => handleSubmit("invoice")}>
                    {submitting ? "Отправляем…" : "Пришлите мне счёт в Kaspi"}
                  </Button>
                )}
                <Button className="w-full" variant="ghost" onClick={() => setPayOpen(false)}>Закрыть</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Подтверждение оплаты</DialogTitle>
                <DialogDescription>
                  {fromRf ? "Загрузите скрин чека о переводе — проверим и включим PRO." : "Загрузите скрин чека из Kaspi — проверим и включим PRO."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label htmlFor="receipt">Скрин чека (ускорит проверку)</Label>
                  <Input
                    id="receipt"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="comment">Комментарий (необязательно)</Label>
                  <Textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={fromRf ? "Например: перевёл через Золотую Корону с карты Сбера" : "Например: перевёл с карты Halyk"}
                    rows={3}
                    className="mt-1.5"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("instruction")}>← Назад</Button>
                <Button onClick={() => handleSubmit("transfer")} disabled={submitting}>
                  {submitting ? "Отправляем…" : "Отправить заявку"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
