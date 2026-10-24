import Link from "next/link";
import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { BILLING_ENABLED, PAYMENTS_OPEN, getBillingStatus } from "@/lib/billing";

function fmtTenge(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₸";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Almaty" });
}

// Граница «1 января 00:00» → людям показываем «31 декабря».
function fmtLastDay(iso: string): string {
  return fmtDate(new Date(new Date(iso).getTime() - 1).toISOString());
}

/**
 * Плашка подписки на главной дашборда (12.10.2026):
 *  - старому мастеру до 23 ноября: «бесплатно до…, до 31 декабря PRO по стартовой цене»;
 *  - на бесплатном тарифе: «объектов N из 10», кнопка PRO;
 *  - PRO: «до даты», за 7 дней — жёлтая, просрочено — красная, но без
 *    блокировки: старое открыто, новые объекты только после оплаты.
 * Из iOS-приложения (куки app_platform=ios, ставит /api/auth/bridge) цены
 * и кнопку оплаты не показываем — правило App Store 3.1.1.
 */
export async function SubscriptionWidget({ masterId }: { masterId: string }) {
  const m = await prisma.master.findUnique({
    where: { id: masterId },
    select: { isOwner: true, welcomeSent: true },
  });
  if (!m) return null;

  const tgUrl = process.env.TELEGRAM_GROUP_INVITE_URL;
  const waUrl = process.env.WHATSAPP_GROUP_INVITE_URL;
  const showCommunity = !m.isOwner && m.welcomeSent && (tgUrl || waUrl);

  const cookieStore = await cookies();
  const fromIos = cookieStore.get("app_platform")?.value === "ios";
  // PAYMENTS_OPEN без BILLING_ENABLED (с 14.10): лимитов нет, но оплатить
  // уже можно — иначе с рабочего стола к /pricing нет пути (Нариман 24.10
  // сам не нашёл, набирал адрес руками).
  const s = (BILLING_ENABLED || PAYMENTS_OPEN) && !m.isOwner ? await getBillingStatus(masterId) : null;

  const payBtn = (label: string, tone: "default" | "amber" = "default") =>
    fromIos ? null : (
      <Button
        asChild
        size="sm"
        className={`shrink-0 ${tone === "amber" ? "bg-amber-600 hover:bg-amber-700" : ""}`}
      >
        <Link href="/pricing">{label}</Link>
      </Button>
    );

  let billingCard: React.ReactNode = null;
  if (s && !BILLING_ENABLED) {
    // Лимиты выключены: всё бесплатно, PRO — по желанию. Из iOS не показываем.
    if (s.proReason === "paid" && s.paidUntil) {
      billingCard = (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-emerald-900">PRO до {fmtDate(s.paidUntil)}</p>
              <p className="text-xs text-emerald-800">Спасибо, что с нами.</p>
            </div>
            {s.daysLeft !== null && s.daysLeft <= 7 && payBtn("Продлить", "amber")}
          </CardContent>
        </Card>
      );
    } else if (!fromIos) {
      billingCard = (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">
                PRO — {fmtTenge(s.launchPrice ? s.prices.launchMonth : s.prices.month)}/мес
                {s.launchPrice && `, стартовая цена до ${fmtLastDay(s.launchPriceUntil)}`}
              </p>
              <p className="text-xs text-amber-800">
                Сейчас всё бесплатно. Оплата — картой или Kaspi, PRO включается сразу.
              </p>
            </div>
            {payBtn("Оплатить")}
          </CardContent>
        </Card>
      );
    }
  } else if (s) {
    if (s.freePeriod) {
      billingCard = (
        <Card className="border-sky-300 bg-sky-50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sky-900">Бесплатно до {fmtDate(s.freeUntil)}</p>
              <p className="text-xs text-sky-800">
                {fromIos
                  ? `Потом — тариф PRO или первые ${s.objectsLimit} объектов бесплатно. Всё, что вы сделали, останется открытым.`
                  : s.launchPrice
                    ? `Потом — PRO или первые ${s.objectsLimit} объектов бесплатно. До ${fmtLastDay(s.launchPriceUntil)} PRO стоит ${fmtTenge(s.prices.launchMonth)}/мес, дальше — ${fmtTenge(s.prices.month)}.`
                    : `Потом — PRO ${fmtTenge(s.prices.month)}/мес или первые ${s.objectsLimit} объектов бесплатно.`}
              </p>
            </div>
            {payBtn("Оплатить PRO")}
          </CardContent>
        </Card>
      );
    } else if (s.proReason === "paid" && s.daysLeft !== null && s.daysLeft <= 7) {
      billingCard = (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">
                {s.daysLeft <= 0 ? "PRO заканчивается сегодня" : `PRO заканчивается через ${s.daysLeft} дн.`}
              </p>
              <p className="text-xs text-amber-800">
                До {fmtDate(s.paidUntil!)}. Старые объекты и КП останутся открытыми в любом случае.
              </p>
            </div>
            {payBtn("Продлить", "amber")}
          </CardContent>
        </Card>
      );
    } else if (!s.isPro) {
      const left = Math.max(0, s.objectsLimit - s.objectsUsed);
      const expired = !!s.paidUntil;
      billingCard = (
        <Card className={left === 0 ? "border-red-300 bg-red-50" : "border-slate-200"}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className={`font-medium ${left === 0 ? "text-red-900" : ""}`}>
                {expired
                  ? "PRO закончился"
                  : left === 0
                    ? `Бесплатные ${s.objectsLimit} объектов использованы`
                    : `Бесплатный тариф: объектов ${s.objectsUsed} из ${s.objectsLimit}`}
              </p>
              <p className={`text-xs ${left === 0 ? "text-red-800" : "text-muted-foreground"}`}>
                {left === 0 || expired
                  ? "Всё старое открыто: смотреть, скачать, отправить. Новые объекты — на тарифе PRO."
                  : `Ещё ${left} бесплатно. Потом — тариф PRO, старое останется открытым.`}
                {s.launchPrice && !fromIos && ` До ${fmtLastDay(s.launchPriceUntil)} — ${fmtTenge(s.prices.launchMonth)}/мес.`}
              </p>
            </div>
            {payBtn(left === 0 || expired ? "Открыть PRO" : "PRO")}
          </CardContent>
        </Card>
      );
    }
  }

  if (!showCommunity && !billingCard) return null;

  return (
    <div className="space-y-3">
      {billingCard}

      {showCommunity && (
        <Card>
          <CardContent className="p-4">
            <p className="font-medium text-sm mb-2">Сообщество мастеров</p>
            <p className="text-xs text-muted-foreground mb-3">
              Закрытый чат: обмен опытом, ответы на вопросы, анонсы обновлений.
            </p>
            <div className="flex gap-2">
              {tgUrl && (
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <a href={tgUrl} target="_blank" rel="noopener noreferrer">💬 Telegram</a>
                </Button>
              )}
              {waUrl && (
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <a href={waUrl} target="_blank" rel="noopener noreferrer">📱 WhatsApp</a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
