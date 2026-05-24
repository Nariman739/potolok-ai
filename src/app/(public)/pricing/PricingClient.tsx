"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

type Config = {
  kaspiPhone: string;
  kaspiReceiverName: string;
  founderPromocode: string;
  founderPrice: number;
  founderMonths: number;
  standardPrice: number;
};

type AuthedMaster = {
  id: string;
  firstName: string;
  email: string | null;
  phone: string;
  paidUntil: string | null;
  subscriptionTier: "FREE" | "PRO" | "PROPLUS";
  isFounder: boolean;
  founderMonthsPaid: number;
  founderRemaining: number;
  monthlyPrice: number;
  nextAmount: number;
  isOwner: boolean;
};

type RecentPayment = {
  id: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  reviewedAt: string | null;
};

type Props =
  | { mode: "public"; config: Config; master: null }
  | { mode: "authed"; config: Config; master: AuthedMaster; recentPayments: RecentPayment[] };

function formatTenge(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₸";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function statusBadge(s: PaymentStatus) {
  if (s === "APPROVED") return <Badge className="bg-green-600 hover:bg-green-600">Активирована</Badge>;
  if (s === "REJECTED") return <Badge variant="destructive">Отклонена</Badge>;
  return <Badge variant="secondary">На проверке</Badge>;
}

export function PricingClient(props: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [step, setStep] = useState<"instruction" | "form">("instruction");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const cfg = props.config;
  const master = props.mode === "authed" ? props.master : null;
  const recentPayments = props.mode === "authed" ? props.recentPayments : [];

  const amountToPay = master?.nextAmount ?? cfg.standardPrice;

  async function handleApplyPromo() {
    setPromoError(null);
    setPromoLoading(true);
    try {
      const res = await fetch("/api/promocode/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error || "Не удалось применить промокод");
        return;
      }
      setPromoOpen(false);
      setPromoCode("");
      startTransition(() => router.refresh());
    } catch {
      setPromoError("Ошибка сети");
    } finally {
      setPromoLoading(false);
    }
  }

  function openPay() {
    setStep("instruction");
    setReceiptFile(null);
    setReceiptUrl(null);
    setComment("");
    setError(null);
    setSubmittedId(null);
    setPayOpen(true);
  }

  async function uploadReceipt(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/payment/upload-receipt", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка загрузки чека");
      return null;
    }
    return data.url as string;
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      let url = receiptUrl;
      if (receiptFile && !url) {
        url = await uploadReceipt(receiptFile);
        if (!url) return;
        setReceiptUrl(url);
      }
      const res = await fetch("/api/payment/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenshotUrl: url,
          comment,
        }),
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

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold">Тарифы PotolokAI</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
          Полный набор инструментов для мастера натяжных потолков: расчёт по фото, КП с публичной
          ссылкой, договор и акт, AI-помощник, конструктор потолка.
        </p>
      </div>

      {/* Status block для залогиненного юзера */}
      {master && (
        <Card className="mb-6 p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">Статус подписки</span>
                {master.isFounder && <Badge className="bg-amber-500 hover:bg-amber-500">🏆 Founder</Badge>}
                {master.isOwner && <Badge>Owner</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {master.paidUntil ? (
                  <>Активна до <b>{formatDate(master.paidUntil)}</b></>
                ) : (
                  <>Не оформлена</>
                )}
              </div>
              {master.isFounder && master.founderRemaining > 0 && (
                <div className="text-sm mt-1">
                  Скидка Founder: ещё <b>{master.founderRemaining}</b> мес по {formatTenge(cfg.founderPrice)}/мес
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{formatTenge(master.nextAmount)}</div>
              <div className="text-xs text-muted-foreground">за следующий месяц</div>
            </div>
          </div>
        </Card>
      )}

      {/* Карточки тарифов */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Card className="p-6 border-2 border-primary">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">Standard</h2>
            <Badge variant="secondary">Основной тариф</Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{formatTenge(cfg.standardPrice)}</div>
          <div className="text-sm text-muted-foreground mb-4">/ месяц</div>
          <ul className="text-sm space-y-1.5 mb-6">
            <li>✓ Безлимитные КП</li>
            <li>✓ Расчёт по фото (AI vision)</li>
            <li>✓ Договор и акт с электронной подписью</li>
            <li>✓ Визуальный конструктор потолка</li>
            <li>✓ AI-помощник в Telegram</li>
            <li>✓ Instagram автопостинг</li>
            <li>✓ CRM для клиентов</li>
          </ul>
          {master ? (
            <Button className="w-full" size="lg" onClick={openPay}>
              Оплатить {formatTenge(master.nextAmount)}
            </Button>
          ) : (
            <Button asChild className="w-full" size="lg">
              <Link href="/auth/register">Зарегистрироваться</Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">Trial 7 дней при регистрации</p>
        </Card>

        <Card className="p-6 border-2 border-amber-500 bg-amber-500/5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              🏆 Founder
            </h2>
            <Badge className="bg-amber-500 hover:bg-amber-500">Только по промокоду</Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{formatTenge(cfg.founderPrice)}</div>
          <div className="text-sm text-muted-foreground mb-1">
            / месяц первые {cfg.founderMonths} месяца
          </div>
          <div className="text-xs text-muted-foreground mb-4">
            Потом {formatTenge(cfg.standardPrice)}/мес. Экономия — <b>{formatTenge((cfg.standardPrice - cfg.founderPrice) * cfg.founderMonths)}</b>.
          </div>
          <ul className="text-sm space-y-1.5 mb-6">
            <li>✓ Всё из Standard</li>
            <li>✓ Бейдж <b>Founder</b> в профиле</li>
            <li>✓ Закрытая Telegram-группа мастеров</li>
            <li>✓ Закрытая WhatsApp-группа</li>
            <li>✓ Прямая линия с разработчиком</li>
          </ul>
          {master ? (
            master.isFounder ? (
              <Button className="w-full" size="lg" variant="secondary" disabled>
                Уже активирован
              </Button>
            ) : (
              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                size="lg"
                onClick={() => setPromoOpen(true)}
              >
                У меня есть промокод
              </Button>
            )
          ) : (
            <Button asChild className="w-full bg-amber-500 hover:bg-amber-600 text-black" size="lg">
              <Link href="/auth/register">Зарегистрироваться</Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Промокод выдаём на Потолок Фест и других офлайн-событиях
          </p>
        </Card>
      </div>

      {/* История платежей */}
      {master && recentPayments.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-medium mb-3">Последние заявки</h3>
          <div className="space-y-2 text-sm">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <div className="font-medium">{formatTenge(p.amount)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</div>
                </div>
                {statusBadge(p.status)}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Promo dialog */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Введите промокод</DialogTitle>
            <DialogDescription>
              Промокод даёт скидку 3 месяца по {formatTenge(cfg.founderPrice)}/мес + бейдж Founder и доступ в закрытые группы.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="promo">Промокод</Label>
            <Input
              id="promo"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="POTOLOKFEST"
              autoFocus
            />
            {promoError && <p className="text-sm text-destructive">{promoError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoOpen(false)}>Отмена</Button>
            <Button onClick={handleApplyPromo} disabled={!promoCode || promoLoading}>
              {promoLoading ? "Применяем…" : "Применить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          {submittedId ? (
            <div className="py-4">
              <DialogHeader>
                <DialogTitle>✅ Заявка отправлена</DialogTitle>
                <DialogDescription>
                  Мы получили вашу заявку на оплату. Обычно подтверждаем в течение часа.
                  После активации придёт уведомление в Telegram + email.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full mt-4" onClick={() => setPayOpen(false)}>Понятно</Button>
            </div>
          ) : step === "instruction" ? (
            <>
              <DialogHeader>
                <DialogTitle>Оплата подписки — {formatTenge(amountToPay)}</DialogTitle>
                <DialogDescription>
                  Переведите по Kaspi на номер ниже, потом загрузите скрин чека.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="rounded-lg bg-muted p-4 space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Сумма</div>
                    <div className="text-2xl font-bold">{formatTenge(amountToPay)}</div>
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
                    <div className="text-sm">укажите ваш email или телефон от аккаунта</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  После перевода нажмите «Я оплатил» и загрузите скрин чека.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayOpen(false)}>Закрыть</Button>
                <Button onClick={() => setStep("form")}>Я оплатил →</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Подтверждение оплаты</DialogTitle>
                <DialogDescription>
                  Загрузите скрин чека из Kaspi — мы проверим и активируем подписку.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label htmlFor="receipt">Скрин чека (необязательно, но ускорит проверку)</Label>
                  <Input
                    id="receipt"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setReceiptFile(e.target.files?.[0] ?? null);
                      setReceiptUrl(null);
                    }}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="comment">Комментарий (необязательно)</Label>
                  <Textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Например: оплатил с карты Halyk, на Kaspi пришло через 5 мин"
                    rows={3}
                    className="mt-1.5"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("instruction")}>← Назад</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
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
