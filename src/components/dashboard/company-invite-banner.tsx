"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Invite = { companyId: string; companyName: string; ownerName: string };
type OwnData = { objects: number; estimates: number; clients: number };

// Приглашение в компанию на сайте (09.11.2026): менеджер работает с компьютера,
// а принять можно было только на экране «Сегодня» в приложении. Зеркало мобильного
// CompanyInviteBanner: те же GET /api/company и POST /api/company/switch.
// «Отклонить» у приглашённого на сервере нет — как и в приложении, только «Не сейчас»:
// скрывает плашку до следующего открытия главной, приглашение остаётся.
export function CompanyInviteBanner() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [ownData, setOwnData] = useState<OwnData | null>(null);
  // Принял приглашение, ждёт владельца (09.11.2026): доступ откроется после подтверждения.
  const [pendingJoin, setPendingJoin] = useState<Invite | null>(null);
  const [askBringFor, setAskBringFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/company")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setInvites(data.invites ?? []);
        setOwnData(data.ownData ?? null);
        setPendingJoin(data.pendingJoin ?? null);
      })
      .catch(() => {});
  }, []);

  async function switchTo(companyId: string, bringData: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, bringData, approvalFlow: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Не удалось принять приглашение");
        return;
      }
      if (data?.pending) {
        toast.success("Заявка отправлена владельцу");
        setPendingJoin(invites.find((i) => i.companyId === companyId) ?? null);
        setInvites((list) => list.filter((i) => i.companyId !== companyId));
        setAskBringFor(null);
        return;
      }
      toast.success(`Вы в компании «${data.companyName}»`);
      setInvites([]);
      router.refresh();
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending() {
    setBusy(true);
    try {
      const res = await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelPending: true }),
      });
      if (!res.ok) {
        toast.error("Не удалось отозвать заявку");
        return;
      }
      toast.success("Заявка отозвана");
      if (pendingJoin) setInvites((list) => [...list, pendingJoin]);
      setPendingJoin(null);
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }

  function accept(companyId: string) {
    const hasOwnData = ownData ? ownData.objects + ownData.clients > 0 : false;
    if (hasOwnData) setAskBringFor(companyId);
    else switchTo(companyId, false);
  }

  if (invites.length === 0 && !pendingJoin) return null;

  return (
    <div className="space-y-3">
      {pendingJoin && (
        <Card className="border-[#1e3a5f]/40 bg-[#1e3a5f]/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg bg-[#1e3a5f] p-2 flex-shrink-0">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Ждём подтверждения от владельца</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {pendingJoin.ownerName || "Владелец"} должен подтвердить, что это вы. Пока база
                «{pendingJoin.companyName}» закрыта, ваши данные никуда не перенесены.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" disabled={busy} onClick={cancelPending}>
                  Отозвать заявку
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {invites.map((inv) => (
        <Card key={inv.companyId} className="border-[#1e3a5f]/40 bg-[#1e3a5f]/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg bg-[#1e3a5f] p-2 flex-shrink-0">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {askBringFor === inv.companyId ? (
                <>
                  <p className="font-semibold text-sm">
                    Перенести ваши данные в «{inv.companyName}»?
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    Объектов: {ownData?.objects ?? 0}, клиентов: {ownData?.clients ?? 0}. Без
                    переноса они останутся в вашей личной компании и не будут видны, пока вы
                    работаете в «{inv.companyName}».
                  </p>
                  <p className="text-xs mt-1 leading-snug">
                    Перенесённые данные останутся у компании, даже если вы потом выйдете. Перенос
                    выполнится после подтверждения владельцем.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => switchTo(inv.companyId, true)}>
                      Перенести
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => switchTo(inv.companyId, false)}>
                      Без переноса
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAskBringFor(null)}>
                      Назад
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-sm">Вас пригласили в компанию «{inv.companyName}»</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    {inv.ownerName ? `Приглашает: ${inv.ownerName}. ` : ""}
                    Вы увидите объекты и клиентов компании, цены станут общими, а ваши новые
                    замеры и КП будут видны владельцу. Вернуться в свою компанию можно в
                    приложении: «Профиль → Люди и бригада». Доступ откроется после подтверждения
                    владельцем.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" disabled={busy} onClick={() => accept(inv.companyId)}>
                      Принять
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setInvites((list) => list.filter((i) => i.companyId !== inv.companyId))}
                    >
                      Не сейчас
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
