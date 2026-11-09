"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Calendar, MapPin, Phone, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrency } from "@/components/currency-provider";
import { CRM_COLUMNS, CRM_COLUMN_LABELS, isCrmColumn, type CrmColumn } from "@/lib/crm-columns";
import type { BoardItem } from "@/lib/crm-board";

// В закрытых колонках показываем только свежие карточки, счётчик — полный.
const TAIL_LIMIT = 50;
const TAIL_COLUMNS: CrmColumn[] = ["done", "lost"];

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "short",
  });
}

function formatPhone(phone: string) {
  return /^\d+$/.test(phone) ? `+${phone}` : phone;
}

// Значение для <input type="datetime-local"> по времени Астаны
function toAlmatyInput(iso: string | null) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86_400_000);
  const local = new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString();
  return iso ? local.slice(0, 16) : `${local.slice(0, 10)}T10:00`;
}

function CardBody({ item, showOwner }: { item: BoardItem; showOwner: boolean }) {
  const { format: formatMoney } = useCurrency();
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm leading-snug break-words min-w-0">{item.name}</p>
        {item.extraObjects > 0 && (
          <span
            title="Ещё объекты этого клиента"
            className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            +{item.extraObjects}
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {item.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="h-3 w-3 flex-shrink-0" />
            {formatPhone(item.phone)}
          </p>
        )}
        {item.address && (
          <p className="flex items-start gap-1.5">
            <MapPin className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="break-words min-w-0">{item.address}</span>
          </p>
        )}
        {item.date && (
          <p className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            {item.date.kind === "install" ? "Монтаж" : "Замер"} {formatDay(item.date.at)}
          </p>
        )}
        {showOwner && item.ownerName && (
          <p className="flex items-center gap-1.5">
            <User className="h-3 w-3 flex-shrink-0" />
            {item.ownerName}
          </p>
        )}
      </div>
      {item.total ? <p className="mt-1.5 text-sm font-semibold">{formatMoney(item.total)}</p> : null}
    </>
  );
}

function DraggableCard({
  item,
  showOwner,
  suppressClick,
}: {
  item: BoardItem;
  showOwner: boolean;
  suppressClick: React.RefObject<boolean>;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <Link
      ref={setNodeRef}
      href={`/dashboard/clients/${item.id}`}
      draggable={false}
      onClick={(e) => {
        if (suppressClick.current) e.preventDefault();
      }}
      {...listeners}
      {...attributes}
      className={`block rounded-lg border bg-background p-3 touch-none transition-colors hover:border-[#1e3a5f]/40 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody item={item} showOwner={showOwner} />
    </Link>
  );
}

function Column({
  column,
  items,
  total,
  children,
}: {
  column: CrmColumn;
  items: BoardItem[];
  total: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <div
      ref={setNodeRef}
      data-column={column}
      className={`flex w-72 flex-shrink-0 flex-col rounded-lg border bg-muted/40 ${
        isOver ? "border-[#1e3a5f] bg-[#1e3a5f]/5" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold truncate">{CRM_COLUMN_LABELS[column]}</h2>
        <span className="flex-shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {total}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 260px)", minHeight: 120 }}>
        {children}
        {total > items.length && (
          <p className="px-1 py-1 text-center text-xs text-muted-foreground">
            Показаны последние {items.length} из {total}
          </p>
        )}
      </div>
    </div>
  );
}

export function ClientsBoard({ initialItems, isTeam }: { initialItems: BoardItem[]; isTeam: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [installFor, setInstallFor] = useState<BoardItem | null>(null);
  const [installValue, setInstallValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  // Отпускание карточки не должно считаться кликом и открывать клиента
  const suppressClick = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    const digits = q.replace(/\D/g, "");
    return items.filter((i) => {
      if (onlyMine && !i.mine) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.address ?? "").toLowerCase().includes(q) ||
        (!!digits && (i.phone ?? "").includes(digits))
      );
    });
  }, [items, search, onlyMine]);

  const byColumn = useMemo(() => {
    const map = new Map<CrmColumn, BoardItem[]>(CRM_COLUMNS.map((c) => [c, []]));
    for (const i of visible) map.get(i.column)!.push(i);
    return map;
  }, [visible]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    suppressClick.current = true;
    setActiveId(String(e.active.id));
  }

  function releaseClick() {
    setActiveId(null);
    // click приходит сразу после pointerup
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }

  async function onDragEnd(e: DragEndEvent) {
    releaseClick();
    const target = e.over?.id;
    const item = items.find((i) => i.id === e.active.id);
    if (!item || !isCrmColumn(target) || target === item.column) return;

    const from = item.column;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, column: target } : i)));
    try {
      const res = await fetch(`/api/clients/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmColumn: target }),
      });
      if (!res.ok) throw new Error();
      if (target === "install_planned" && item.objectId) {
        setInstallValue(toAlmatyInput(item.installAt));
        setInstallFor(item);
      }
    } catch {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, column: from } : i)));
      toast.error("Не удалось перенести карточку");
    }
  }

  async function saveInstallDate() {
    if (!installFor?.objectId || !installValue) return;
    const clientId = installFor.id;
    setSavingDate(true);
    try {
      const at = new Date(`${installValue}:00+05:00`).toISOString();
      const res = await fetch(`/api/objects/${installFor.objectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installAt: at }),
      });
      if (!res.ok) throw new Error();
      setItems((list) =>
        list.map((i) => (i.id === clientId ? { ...i, installAt: at, date: { kind: "install", at } } : i)),
      );
      setInstallFor(null);
    } catch {
      toast.error("Не удалось сохранить дату");
    } finally {
      setSavingDate(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя, телефон или адрес"
            className="pl-9"
          />
        </div>
        {isTeam && (
          <div className="flex gap-1">
            <Button size="sm" variant={onlyMine ? "ghost" : "secondary"} onClick={() => setOnlyMine(false)}>
              Все
            </Button>
            <Button size="sm" variant={onlyMine ? "secondary" : "ghost"} onClick={() => setOnlyMine(true)}>
              Мои
            </Button>
          </div>
        )}
      </div>

      <DndContext id="clients-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={releaseClick}>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {CRM_COLUMNS.map((column) => {
            const all = byColumn.get(column)!;
            const shown = TAIL_COLUMNS.includes(column) ? all.slice(0, TAIL_LIMIT) : all;
            return (
              <Column key={column} column={column} items={shown} total={all.length}>
                {shown.map((item) => (
                  <DraggableCard key={item.id} item={item} showOwner={isTeam} suppressClick={suppressClick} />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeItem && (
            <div className="w-[17rem] rounded-lg border bg-background p-3 shadow-lg">
              <CardBody item={activeItem} showOwner={isTeam} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Dialog open={!!installFor} onOpenChange={(open) => !open && setInstallFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Когда монтаж?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{installFor?.name}</p>
          <Input
            type="datetime-local"
            value={installValue}
            onChange={(e) => setInstallValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInstallFor(null)}>
              Позже
            </Button>
            <Button onClick={saveInstallDate} disabled={savingDate || !installValue}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
