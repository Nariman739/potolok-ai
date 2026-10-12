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

type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";
type Period = "month" | "year";

type Config = {
  kaspiPhone: string;
  kaspiReceiverName: string;
  priceMonth: number;
  priceYear: number;
  founderPriceMonth: number;
  founderPriceYear: number;
  founderMonths: number;
  founderDeadline: string;
  freeObjects: number;
  billingEnabled: boolean;
};

type AuthedMaster = {
  id: string;
  firstName: string;
  isOwner: boolean;
  status: BillingStatus;
  /** Цена для этого мастера с учётом основателя. */
  priceMonth: number;
  priceYear: number;
};

type RecentPayment = {
  id: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  days: number;
};

type Props =
  | { mode: "public"; config: Config; master: null }
  | { mode: "authed"; config: Config; master: AuthedMaster; recentPayments: RecentPayment[] };

function fmt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₸";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function statusBadge(s: PaymentStatus) {
  if (s === "APPROVED") return <Badge className="bg-green-600 hover:bg-green-600">Активирована</Badge>;
  if (s === "REJECTED") return <Badge variant="destructive">Отклонена</Badge>;
  return <Badge variant="secondary">На проверке</Badge>;
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
  const master = props.mode === "authed" ? props.master : null;
  const recentPayments = props.mode === "authed" ? props.recentPayments : [];

  const now = Date.now();
  const founderOpen = now < new Date(cfg.founderDeadline).getTime();
  // Для гостя показываем цену основателя, пока окно открыто; для мастера — его цену.
  const priceMonth = master ? master.priceMonth : founderOpen ? cfg.founderPriceMonth : cfg.priceMonth;
  const priceYear = master ? master.priceYear : founderOpen ? cfg.founderPriceYear : cfg.priceYear;
  const founderApplies = master ? priceMonth < cfg.priceMonth : founderOpen;

  const [period, setPeriod] = useState<Period>("year");
  const [payOpen, setPayOpen] = useState(false);
  const [step, setStep] = useState<"instruction" | "form">("instruction");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [method, setMethod] = useState<"transfer" | "invoice">("transfer");

  const amountToPay = period === "year" ? priceYear : priceMonth;

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

  const s = master?.status;
  const canPay = cfg.billingEnabled && !!master && !master.isOwner;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold">Сколько стоит PotolokAI</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          Первые {cfg.freeObjects} объектов — бесплатно, без карты и без срока. Дальше — PRO за{" "}
          {fmt(cfg.priceMonth)} в месяц: меньше 3% одного заказа.
        </p>
        {!cfg.billingEnabled && (
          <p className="mt-3 inline-block rounded-full bg-sky-100 text-sky-900 text-sm px-4 py-1">
            Сейчас всё бесплатно. Цены ниже начнут действовать позже — предупредим заранее.
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
                {s.isFounder && <Badge className="bg-amber-500 hover:bg-amber-500">🏆 Основатель</Badge>}
                {master.isOwner && <Badge>Owner</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {s.proReason === "paid" && s.paidUntil ? (
                  <>PRO до <b>{fmtDate(s.paidUntil)}</b></>
                ) : s.freePeriod ? (
                  <>Бесплатно до <b>{fmtDate(s.freeUntil)}</b>, потом — бесплатный тариф или PRO</>
                ) : s.proReason === "owner" ? (
                  <>Владелец сервиса</>
                ) : (
                  <>Бесплатный тариф: объектов <b>{s.objectsUsed} из {s.objectsLimit}</b></>
                )}
              </div>
            </div>
            {founderApplies && !master.isOwner && (
              <div className="text-sm rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
                {s.isFounder
                  ? `Цена основателя: ${fmt(cfg.founderPriceMonth)}/мес весь первый год`
                  : `Оплатите до ${fmtDate(cfg.founderDeadline)} — и весь год по ${fmt(cfg.founderPriceMonth)}/мес вместо ${fmt(cfg.priceMonth)}`}
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
          <div className="text-3xl font-bold mb-1">0 ₸</div>
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
          {founderApplies && (
            <span className="absolute -top-3 left-5 rounded-full bg-amber-500 text-black text-xs font-semibold px-3 py-1">
              Цена основателя до {fmtDate(cfg.founderDeadline)}
            </span>
          )}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">PRO</h2>
            <Badge>Для работы</Badge>
          </div>

          {/* Переключатель периода */}
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

          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold">{fmt(period === "year" ? priceYear : priceMonth)}</div>
            {founderApplies && (
              <div className="text-base text-muted-foreground line-through">
                {fmt(period === "year" ? cfg.priceYear : cfg.priceMonth)}
              </div>
            )}
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            {period === "year"
              ? `за год — это ${fmt(Math.round(priceYear / 12))} в месяц`
              : "в месяц"}
            {founderApplies && period === "month" && ` · первый год, потом ${fmt(cfg.priceMonth)}`}
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
            Kaspi или карта. Без автосписания — продлеваете сами, когда удобно.
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
                  <div className="font-medium">{fmt(p.amount)} · {p.days >= 365 ? "год" : "месяц"}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</div>
                </div>
                {statusBadge(p.status)}
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
                <DialogTitle>✅ Заявка отправлена</DialogTitle>
                <DialogDescription>
                  {method === "invoice"
                    ? "Счёт придёт в ваш Kaspi в ближайшее время, обычно в течение часа. Оплатите его — и PRO включится, придёт уведомление в приложение."
                    : "Проверим перевод и включим PRO — обычно в течение часа. Придёт уведомление в приложение."}
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full mt-4" onClick={() => setPayOpen(false)}>Понятно</Button>
            </div>
          ) : step === "instruction" ? (
            <>
              <DialogHeader>
                <DialogTitle>PRO на {period === "year" ? "год" : "месяц"} — {fmt(amountToPay)}</DialogTitle>
                <DialogDescription>
                  Переведите по Kaspi на номер ниже и загрузите скрин чека — или попросите счёт, он придёт прямо в ваш Kaspi.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="rounded-lg bg-muted p-4 space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Сумма</div>
                    <div className="text-2xl font-bold">{fmt(amountToPay)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Номер для Kaspi-перевода</div>
                    <div className="text-lg font-mono font-semibold select-all">{cfg.kaspiPhone}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Получатель</div>
                    <div>{cfg.kaspiReceiverName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">В комментарии перевода</div>
                    <div className="text-sm">укажите телефон от аккаунта</div>
                  </div>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter className="flex-col sm:flex-col gap-2">
                <Button className="w-full" onClick={() => setStep("form")}>Я перевёл → загрузить чек</Button>
                <Button className="w-full" variant="secondary" disabled={submitting} onClick={() => handleSubmit("invoice")}>
                  {submitting ? "Отправляем…" : "Пришлите мне счёт в Kaspi"}
                </Button>
                <Button className="w-full" variant="ghost" onClick={() => setPayOpen(false)}>Закрыть</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Подтверждение оплаты</DialogTitle>
                <DialogDescription>
                  Загрузите скрин чека из Kaspi — проверим и включим PRO.
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
                    placeholder="Например: перевёл с карты Halyk"
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
