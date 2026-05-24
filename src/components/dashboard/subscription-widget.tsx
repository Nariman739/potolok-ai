import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export async function SubscriptionWidget({ masterId }: { masterId: string }) {
  const m = await prisma.master.findUnique({
    where: { id: masterId },
    select: {
      paidUntil: true,
      isFounder: true,
      isOwner: true,
      welcomeSent: true,
      billingNotes: true,
    },
  });
  if (!m) return null;

  const tgUrl = process.env.TELEGRAM_GROUP_INVITE_URL;
  const waUrl = process.env.WHATSAPP_GROUP_INVITE_URL;
  const showCommunity = !m.isOwner && m.welcomeSent && (tgUrl || waUrl);

  const days = daysUntil(m.paidUntil);
  const isTrial = m.billingNotes === "trial 7d";
  const showTrialBanner = !m.isOwner && days !== null && days >= 0 && days <= 3;
  const showExpiredBanner = !m.isOwner && days !== null && days < 0;

  if (!showCommunity && !showTrialBanner && !showExpiredBanner) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showExpiredBanner && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-red-900">Подписка истекла</p>
              <p className="text-xs text-red-800">
                Доступ к функциям ограничен. Оформите подписку, чтобы продолжить работу.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link href="/pricing">Оформить</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {showTrialBanner && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">
                {isTrial ? "Trial заканчивается" : "Подписка скоро закончится"}
              </p>
              <p className="text-xs text-amber-800">
                {days === 0
                  ? "Сегодня последний день"
                  : days === 1
                    ? "Остался 1 день"
                    : `Осталось ${days} дн.`}
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0 bg-amber-600 hover:bg-amber-700">
              <Link href="/pricing">Оформить</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {showCommunity && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-sm">Сообщество мастеров</p>
              {m.isFounder && <Badge className="bg-amber-500 hover:bg-amber-500">🏆 Founder</Badge>}
            </div>
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
