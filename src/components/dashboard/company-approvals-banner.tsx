"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Approval = {
  id: string;
  name: string;
  phone: string | null;
  bring: { objects: number; estimates: number; clients: number } | null;
};

// Заявки на вступление в компанию (09.11.2026): владелец подтверждает здесь или в приложении
// («Профиль → Люди»). Отдельной страницы «Люди» на сайте нет, поэтому плашка на главной;
// она же работает для владельцев на старых сборках приложения.
export function CompanyApprovalsBanner() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [confirm, setConfirm] = useState<{ id: string; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/company")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setApprovals(data.approvals ?? []);
      })
      .catch(() => {});
  }, []);

  async function decide(id: string, approve: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/company/members/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Не удалось сохранить решение");
        return;
      }
      toast.success(approve ? "Сотрудник подтверждён" : "Заявка отклонена");
      setApprovals((list) => list.filter((a) => a.id !== id));
      setConfirm(null);
      router.refresh();
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setBusy(false);
    }
  }

  if (approvals.length === 0) return null;

  return (
    <div className="space-y-3">
      {approvals.map((a) => {
        const asking = confirm?.id === a.id ? confirm : null;
        return (
          <Card key={a.id} className="border-[#1e3a5f]/40 bg-[#1e3a5f]/5">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="rounded-lg bg-[#1e3a5f] p-2 flex-shrink-0">
                <UserPlus className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                {asking ? (
                  <>
                    <p className="font-semibold text-sm">
                      {asking.approve ? `Подтвердить: ${a.name}?` : "Отклонить заявку?"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">
                      {asking.approve
                        ? `${a.name} увидит объекты, клиентов и цены компании.`
                        : "С этого номера больше не смогут подать заявку, пока вы не добавите его заново."}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant={asking.approve ? "default" : "destructive"} disabled={busy} onClick={() => decide(a.id, asking.approve)}>
                        {asking.approve ? "Подтвердить" : "Отклонить"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
                        Отмена
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-sm">
                      {a.name}{a.phone ? `, ${a.phone}` : ""} просит доступ к компании
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-snug">
                      Номер при регистрации не проверяется. Если не уверены, что это ваш сотрудник, сначала позвоните ему.
                    </p>
                    {a.bring && (
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        Перенесёт в компанию: объектов {a.bring.objects}, клиентов {a.bring.clients}.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" disabled={busy} onClick={() => setConfirm({ id: a.id, approve: true })}>
                        Подтвердить
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ id: a.id, approve: false })}>
                        Отклонить
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
