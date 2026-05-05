"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Users,
  Phone,
  MessageSquare,
  Search,
  Calendar,
} from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  SOURCE_LABELS,
  EVENT_LABELS,
  type DealStatusKey,
  type ClientSourceKey,
  type EventTypeKey,
} from "./constants";
import { NewClientDialog } from "./new-client-dialog";

type Item = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  source: ClientSourceKey | null;
  status: DealStatusKey;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  estimatesCount: number;
  totalSum: number;
  lastEvent: { type: EventTypeKey; content: string | null; createdAt: string } | null;
};

const STATUS_ORDER: (DealStatusKey | "ALL")[] = [
  "ALL",
  "NEW",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATING",
  "WON",
  "LOST",
];

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `сегодня, ${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

export function ClientsList({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [activeStatus, setActiveStatus] = useState<DealStatusKey | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: items.length };
    for (const i of items) {
      map[i.status] = (map[i.status] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (activeStatus !== "ALL") {
      list = list.filter((i) => i.status === activeStatus);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, "");
      list = list.filter((i) => {
        if (i.name.toLowerCase().includes(q)) return true;
        if (qDigits && i.phone && i.phone.includes(qDigits)) return true;
        return false;
      });
    }
    return list;
  }, [items, activeStatus, search]);

  function handleClientCreated(c: { id: string; name: string; phone: string | null }) {
    const newItem: Item = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: null,
      source: null,
      status: "NEW",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      estimatesCount: 0,
      totalSum: 0,
      lastEvent: null,
    };
    setItems((prev) => [newItem, ...prev]);
    setShowNewDialog(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Клиенты</h1>
          <p className="text-sm text-muted-foreground">
            Всего: {items.length}
          </p>
        </div>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="bg-[#1e3a5f] hover:bg-[#152d4a]"
        >
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по имени или телефону"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => {
          const active = activeStatus === s;
          const label =
            s === "ALL" ? "Все" : STATUS_LABELS[s as DealStatusKey];
          const count = counts[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (active
                  ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                  : "border-border bg-white text-muted-foreground hover:border-[#1e3a5f]/40")
              }
            >
              {label}
              <span
                className={
                  "rounded-full px-1.5 text-[10px] " +
                  (active ? "bg-white/20" : "bg-muted")
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <div className="rounded-2xl bg-[#1e3a5f]/10 p-4">
              <Users className="h-8 w-8 text-[#1e3a5f]" />
            </div>
            {items.length === 0 ? (
              <>
                <h3 className="font-semibold text-lg">Клиентов пока нет</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Добавляй клиентов вручную или они автоматически создадутся при создании КП
                </p>
                <Button
                  onClick={() => setShowNewDialog(true)}
                  className="bg-[#1e3a5f] hover:bg-[#152d4a]"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить первого клиента
                </Button>
              </>
            ) : (
              <>
                <h3 className="font-semibold">Никого не нашли</h3>
                <p className="text-sm text-muted-foreground">
                  Попробуй другой запрос или фильтр
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Link key={c.id} href={`/dashboard/clients/${c.id}`}>
              <Card className="cursor-pointer hover:bg-muted/40 transition-colors">
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{c.name}</span>
                      <Badge className={STATUS_COLORS[c.status]} variant="secondary">
                        {STATUS_LABELS[c.status]}
                      </Badge>
                      {c.source && (
                        <span className="text-[11px] text-muted-foreground">
                          {SOURCE_LABELS[c.source]}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </span>
                      )}
                      {c.estimatesCount > 0 && (
                        <span>{c.estimatesCount} КП</span>
                      )}
                      {c.totalSum > 0 && (
                        <span>{formatMoney(c.totalSum)} ₸</span>
                      )}
                    </div>
                    {c.lastEvent ? (
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="truncate">
                          {EVENT_LABELS[c.lastEvent.type]}
                          {c.lastEvent.content
                            ? `: ${c.lastEvent.content}`
                            : ""}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(c.updatedAt)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewClientDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={handleClientCreated}
      />
    </div>
  );
}
