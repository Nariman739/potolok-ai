"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

type Payment = {
  id: string;
  amount: number;
  promocode: string | null;
  screenshotUrl: string | null;
  comment: string | null;
  status: PaymentStatus;
  createdAt: string;
  reviewedAt: string | null;
  activatedDays: number | null;
  master: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    companyName: string | null;
    subscriptionTier: string;
    paidUntil: string | null;
    isFounder: boolean;
    founderMonthsPaid: number;
  };
};

function formatTenge(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₸";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(s: PaymentStatus) {
  if (s === "APPROVED") return <Badge className="bg-green-600 hover:bg-green-600">Активирована</Badge>;
  if (s === "REJECTED") return <Badge variant="destructive">Отклонена</Badge>;
  return <Badge variant="secondary">На проверке</Badge>;
}

export function PaymentsAdminClient({ payments }: { payments: Payment[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (filter !== "ALL" && p.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.master.name.toLowerCase().includes(q) ||
          p.master.phone.includes(q) ||
          (p.master.email ?? "").toLowerCase().includes(q) ||
          (p.master.companyName ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [payments, filter, search]);

  async function approve(p: Payment) {
    if (!confirm(`Активировать подписку на 30 дней?\n\n${p.master.name} — ${formatTenge(p.amount)}`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/payments/${p.id}/approve`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Не удалось активировать");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  async function reject(p: Payment) {
    const notes = prompt(`Отклонить оплату? Причина (необязательно):`);
    if (notes === null) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/payments/${p.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Не удалось отклонить");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => ({
    pending: payments.filter((p) => p.status === "PENDING").length,
    approved: payments.filter((p) => p.status === "APPROVED").length,
    rejected: payments.filter((p) => p.status === "REJECTED").length,
  }), [payments]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="PENDING">
              На проверке <Badge variant="secondary" className="ml-2">{counts.pending}</Badge>
            </TabsTrigger>
            <TabsTrigger value="APPROVED">
              Активирована <Badge variant="secondary" className="ml-2">{counts.approved}</Badge>
            </TabsTrigger>
            <TabsTrigger value="REJECTED">
              Отклонена <Badge variant="secondary" className="ml-2">{counts.rejected}</Badge>
            </TabsTrigger>
            <TabsTrigger value="ALL">Все</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени, телефону, email"
          className="md:max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">Заявок не найдено</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                {p.screenshotUrl && (
                  <a
                    href={p.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.screenshotUrl}
                      alt="Чек"
                      className="w-32 h-32 object-cover rounded border"
                    />
                  </a>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.master.name || p.master.phone}</span>
                        {p.master.isFounder && (
                          <Badge className="bg-amber-500 hover:bg-amber-500">🏆 Founder</Badge>
                        )}
                        {statusBadge(p.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.master.phone}
                        {p.master.email && ` · ${p.master.email}`}
                        {p.master.companyName && ` · ${p.master.companyName}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold">{formatTenge(p.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDate(p.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs space-y-0.5 text-muted-foreground">
                    <div>
                      Тариф: {p.master.subscriptionTier} ·{" "}
                      {p.master.paidUntil
                        ? `до ${new Date(p.master.paidUntil).toLocaleDateString("ru-RU")}`
                        : "без даты"}
                    </div>
                    {p.promocode && <div>Промокод: <b>{p.promocode}</b></div>}
                    {p.comment && <div>Комментарий: {p.comment}</div>}
                    {p.reviewedAt && <div>Обработано: {formatDate(p.reviewedAt)}</div>}
                  </div>
                  {p.status === "PENDING" && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        disabled={busyId === p.id}
                        onClick={() => approve(p)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        ✅ Активировать 30 дней
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === p.id}
                        onClick={() => reject(p)}
                      >
                        ❌ Отклонить
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
