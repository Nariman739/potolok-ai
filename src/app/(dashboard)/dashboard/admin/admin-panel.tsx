"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Crown, Calendar, Users } from "lucide-react";

type Tier = "FREE" | "PRO" | "PROPLUS";

type Master = {
  id: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  phone: string;
  email: string | null;
  subscriptionTier: Tier;
  paidUntil: string | null;
  billingNotes: string | null;
  kpGeneratedThisMonth: number;
  isOwner: boolean;
  createdAt: string;
  estimatesCount: number;
  clientsCount: number;
};

type Summary = {
  total: number;
  free: number;
  pro: number;
  proPlus: number;
  paid: number;
};

const TIER_LABELS: Record<Tier, string> = {
  FREE: "FREE",
  PRO: "PRO",
  PROPLUS: "PRO+",
};

const TIER_COLORS: Record<Tier, string> = {
  FREE: "bg-zinc-200 text-zinc-700",
  PRO: "bg-emerald-100 text-emerald-800",
  PROPLUS: "bg-purple-100 text-purple-800",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AdminPanel({
  summary,
  masters,
}: {
  summary: Summary;
  masters: Master[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Master | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return masters;
    const q = search.toLowerCase();
    return masters.filter((m) => {
      if (m.email?.toLowerCase().includes(q)) return true;
      if (m.phone.includes(q)) return true;
      if (m.firstName.toLowerCase().includes(q)) return true;
      if (m.lastName?.toLowerCase().includes(q)) return true;
      if (m.companyName?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [masters, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 text-amber-500" />
        <h1 className="text-2xl font-bold">Админ-панель</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Всего" value={summary.total} />
        <Stat label="FREE" value={summary.free} />
        <Stat label="PRO" value={summary.pro} />
        <Stat label="PRO+" value={summary.proPlus} />
        <Stat label="Активных" value={summary.paid} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по email, телефону, имени, компании"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((m) => {
          const expired =
            m.paidUntil && new Date(m.paidUntil) < new Date();
          return (
            <Card key={m.id}>
              <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">
                      {m.firstName} {m.lastName ?? ""}
                    </span>
                    {m.companyName && (
                      <span className="text-sm text-muted-foreground">
                        {m.companyName}
                      </span>
                    )}
                    <Badge className={TIER_COLORS[m.subscriptionTier]} variant="secondary">
                      {TIER_LABELS[m.subscriptionTier]}
                    </Badge>
                    {m.isOwner && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                        owner
                      </Badge>
                    )}
                    {expired && (
                      <Badge variant="secondary" className="bg-red-100 text-red-700">
                        просрочено
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {m.email && <span>{m.email}</span>}
                    <span>{m.phone}</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> до{" "}
                      {formatDate(m.paidUntil)}
                    </span>
                    <span>КП в мес: {m.kpGeneratedThisMonth}</span>
                    <span>Всего КП: {m.estimatesCount}</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {m.clientsCount}
                    </span>
                  </div>
                  {m.billingNotes && (
                    <p className="text-xs mt-1 text-muted-foreground italic truncate">
                      {m.billingNotes}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(m)}
                >
                  Изменить тариф
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Никого не нашли
        </p>
      )}

      {editing && (
        <EditTierDialog
          master={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function EditTierDialog({
  master,
  onClose,
  onSaved,
}: {
  master: Master;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tier, setTier] = useState<Tier>(master.subscriptionTier);
  const [paidUntil, setPaidUntil] = useState<string>(
    master.paidUntil ? master.paidUntil.slice(0, 10) : "",
  );
  const [notes, setNotes] = useState(master.billingNotes ?? "");
  const [resetCounter, setResetCounter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setMonthsAhead(months: number) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setPaidUntil(d.toISOString().slice(0, 10));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/masters/${master.id}/tier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          paidUntil: paidUntil || null,
          billingNotes: notes || null,
          resetCounter,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Ошибка");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Тариф · {master.firstName} {master.lastName ?? ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Тариф</Label>
            <div className="flex gap-2 mt-1">
              {(["FREE", "PRO", "PROPLUS"] as Tier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
                    (tier === t
                      ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                      : "border-border bg-white")
                  }
                >
                  {TIER_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="paidUntil">Оплачено до</Label>
            <Input
              id="paidUntil"
              type="date"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonthsAhead(m)}
                  className="text-xs rounded-full border px-3 py-1 hover:bg-muted"
                >
                  +{m} мес
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Заметка</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Kaspi 5000₸ за 3 мес"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={resetCounter}
              onChange={(e) => setResetCounter(e.target.checked)}
            />
            Сбросить счётчик КП в этом месяце
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
