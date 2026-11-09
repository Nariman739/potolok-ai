"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
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
import { ClientsHeader } from "./clients-header";
import { NewClientDialog } from "./new-client-dialog";

// В закрытых колонках показываем только свежие карточки, счётчик — полный.
const TAIL_LIMIT = 50;
const TAIL_COLUMNS: CrmColumn[] = ["done", "lost"];

// В строке этапов длинные названия не помещаются на 1366
const CHIP_LABELS: Partial<Record<CrmColumn, string>> = {
  purchase: "Закуп",
  planning: "План",
  install_planned: "Монтаж запл.",
};

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "short",
  });
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return /^\+?[\d\s()-]+$/.test(phone) ? `+${digits}` : phone;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Клиента часто заводят одним номером: тогда номер и есть заголовок
function cardLines(item: BoardItem) {
  const name = item.name.trim();
  const nameDigits = name.replace(/\D/g, "");
  const nameIsPhone = /^[\d\s+()-]+$/.test(name) && nameDigits.length >= 7;
  const phoneDigits = item.phone?.replace(/\D/g, "") ?? "";
  const title = nameIsPhone ? formatPhone(name) : name || (item.phone ? formatPhone(item.phone) : "Без имени");
  const phone = item.phone && name && !(nameIsPhone && nameDigits === phoneDigits) ? formatPhone(item.phone) : null;
  const address = item.address && item.address.trim().toLowerCase() !== name.toLowerCase() ? item.address : null;
  return { title, phone, address };
}

// Значение для <input type="datetime-local"> по времени Астаны
function almatyInput(iso: string) {
  return new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function almatyPreset(days: number) {
  const day = new Date(Date.now() + 5 * 60 * 60 * 1000 + days * 86_400_000).toISOString().slice(0, 10);
  return `${day}T10:00`;
}

function CardBody({ item, showOwner }: { item: BoardItem; showOwner: boolean }) {
  const { format: formatMoney } = useCurrency();
  const { title, phone, address } = cardLines(item);
  const owner = showOwner && item.ownerName ? item.ownerName : null;
  return (
    <>
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium leading-5">{title}</p>
        {item.extraObjects > 0 && (
          <span title="Ещё объекты этого клиента" className="flex-shrink-0 text-[11px] text-muted-foreground">
            +{item.extraObjects}
          </span>
        )}
        {owner && (
          <span
            title={owner}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center self-center rounded-full bg-[#1e3a5f]/10 text-[8px] font-semibold text-[#1e3a5f]"
          >
            {initials(owner)}
          </span>
        )}
        {item.total ? (
          <span className="flex-shrink-0 whitespace-nowrap text-sm font-semibold leading-5">
            {formatMoney(item.total)}
          </span>
        ) : null}
      </div>
      {phone && <p className="truncate text-xs leading-4 text-muted-foreground">{phone}</p>}
      {(address || item.date) && (
        <div className="flex items-baseline justify-between gap-2 text-xs leading-4 text-muted-foreground">
          <span className="min-w-0 truncate">{address}</span>
          {item.date && (
            <span className="flex-shrink-0 whitespace-nowrap">
              {item.date.kind === "install" ? "Монтаж" : "Замер"} {formatDay(item.date.at)}
            </span>
          )}
        </div>
      )}
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
      className={`block rounded-md border bg-background px-2.5 py-2 touch-none transition-colors hover:border-[#1e3a5f]/40 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody item={item} showOwner={showOwner} />
    </Link>
  );
}

function Column({
  column,
  shown,
  total,
  dragging,
  children,
}: {
  column: CrmColumn;
  shown: number;
  total: number;
  dragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const highlight = isOver ? "border-[#1e3a5f] bg-[#1e3a5f]/5" : "";

  // Пустая колонка — узкая полоска, чтобы на экран помещалось больше живых
  if (total === 0 && !dragging) {
    return (
      <div
        ref={setNodeRef}
        data-column={column}
        className="flex w-11 flex-shrink-0 flex-col items-center gap-2 rounded-lg border bg-muted/40 py-2"
      >
        <span className="text-xs font-medium text-muted-foreground">0</span>
        <h2 className="text-xs font-medium text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
          {CRM_COLUMN_LABELS[column]}
        </h2>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      data-column={column}
      className={`flex flex-shrink-0 flex-col rounded-lg border bg-muted/40 ${total === 0 ? "w-44" : "w-72"} ${highlight}`}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <h2 className="truncate text-sm font-semibold">{CRM_COLUMN_LABELS[column]}</h2>
        <span className="flex-shrink-0 rounded-full bg-background px-2 text-xs font-medium text-muted-foreground">
          {total}
        </span>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5" style={{ maxHeight: "calc(100vh - 200px)", minHeight: 80 }}>
        {children}
        {total === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Перенести сюда</p>}
        {total > shown && (
          <p className="px-1 py-1 text-center text-xs text-muted-foreground">
            Показаны последние {shown} из {total}
          </p>
        )}
      </div>
    </div>
  );
}

export function ClientsBoard({
  initialItems,
  isTeam,
}: {
  initialItems: BoardItem[];
  isTeam: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<{ item: BoardItem; from: CrmColumn } | null>(null);
  const [installValue, setInstallValue] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
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

  function updateEdge() {
    const el = boardRef.current;
    if (el) setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateEdge();
    const el = boardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdge);
    observer.observe(el);
    return () => observer.disconnect();
  }, [byColumn, activeId]);

  function scrollToColumn(column: CrmColumn) {
    const board = boardRef.current;
    const el = board?.querySelector<HTMLElement>(`[data-column="${column}"]`);
    if (board && el) board.scrollTo({ left: el.offsetLeft - board.offsetLeft, behavior: "smooth" });
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  function setColumn(id: string, column: CrmColumn) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, column } : i)));
  }

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

  async function commitMove(item: BoardItem, from: CrmColumn, target: CrmColumn, installAt?: string) {
    setColumn(item.id, target);
    try {
      const res = await fetch(`/api/clients/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crmColumn: target }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setColumn(item.id, from);
      toast.error("Не удалось перенести карточку");
      return;
    }
    if (!installAt || !item.objectId) return;
    try {
      const res = await fetch(`/api/objects/${item.objectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installAt }),
      });
      if (!res.ok) throw new Error();
      setItems((list) =>
        list.map((i) => (i.id === item.id ? { ...i, installAt, date: { kind: "install", at: installAt } } : i)),
      );
    } catch {
      toast.error("Карточка перенесена, но дату сохранить не удалось");
    }
  }

  function onDragEnd(e: DragEndEvent) {
    releaseClick();
    const target = e.over?.id;
    const item = items.find((i) => i.id === e.active.id);
    if (!item || !isCrmColumn(target) || target === item.column) return;

    // Перенос с датой записываем только после ответа в диалоге: крестик и Esc его отменяют
    if (target === "install_planned" && item.objectId) {
      setColumn(item.id, target);
      setInstallValue(item.installAt ? almatyInput(item.installAt) : almatyPreset(1));
      setPendingInstall({ item, from: item.column });
      return;
    }
    commitMove(item, item.column, target);
  }

  function cancelInstall() {
    if (pendingInstall) setColumn(pendingInstall.item.id, pendingInstall.from);
    setPendingInstall(null);
  }

  async function confirmInstall(withDate: boolean) {
    if (!pendingInstall) return;
    setSavingDate(true);
    const installAt = withDate ? new Date(`${installValue}:00+05:00`).toISOString() : undefined;
    await commitMove(pendingInstall.item, pendingInstall.from, "install_planned", installAt);
    setSavingDate(false);
    setPendingInstall(null);
  }

  function handleClientCreated(c: { id: string; name: string; phone: string | null }) {
    const item: BoardItem = {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: null,
      column: "new",
      total: null,
      date: null,
      ownerName: null,
      mine: true,
      objectId: null,
      installAt: null,
      extraObjects: 0,
      updatedAt: new Date().toISOString(),
    };
    setItems((list) => [item, ...list]);
    setShowNewDialog(false);
  }

  const pendingLines = pendingInstall ? cardLines(pendingInstall.item) : null;

  return (
    <div className="space-y-3">
      <ClientsHeader
        total={items.length}
        search={search}
        onSearch={setSearch}
        placeholder="Имя, телефон или адрес"
        isTeam={isTeam}
        onlyMine={onlyMine}
        onOnlyMine={setOnlyMine}
        view="board"
        showToggle
        onAdd={() => setShowNewDialog(true)}
      />

      {/* На телефоне touch-none карточек мешает прокрутке, и 12 колонок там негде показать */}
      <div className="md:hidden rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Канбан работает на компьютере.{" "}
        <Link href="/dashboard/clients" className="font-medium text-[#1e3a5f] underline">
          Открыть список
        </Link>
      </div>

      <div className="hidden space-y-2 md:block">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {CRM_COLUMNS.map((column) => (
            <button
              key={column}
              data-chip={column}
              onClick={() => scrollToColumn(column)}
              className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-[#1e3a5f]/40 hover:text-foreground"
            >
              {CHIP_LABELS[column] ?? CRM_COLUMN_LABELS[column]}
              <span className="font-semibold">{byColumn.get(column)!.length}</span>
            </button>
          ))}
        </div>

        <DndContext
          id="clients-board"
          sensors={sensors}
          // По курсору: карточка шире развёрнутой пустой колонки и иначе падала в соседнюю
          collisionDetection={pointerWithin}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={releaseClick}
        >
          <div className="relative">
            <div ref={boardRef} onScroll={updateEdge} className="relative flex gap-2 overflow-x-auto pb-2">
              {CRM_COLUMNS.map((column) => {
                const all = byColumn.get(column)!;
                const shown = TAIL_COLUMNS.includes(column) ? all.slice(0, TAIL_LIMIT) : all;
                return (
                  <Column key={column} column={column} shown={shown.length} total={all.length} dragging={!!activeId}>
                    {shown.map((item) => (
                      <DraggableCard
                        key={item.id}
                        item={item}
                        showOwner={isTeam && !onlyMine}
                        suppressClick={suppressClick}
                      />
                    ))}
                  </Column>
                );
              })}
            </div>
            {canScrollRight && (
              <>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
                <button
                  aria-label="Прокрутить вправо"
                  onClick={() => boardRef.current?.scrollBy({ left: 600, behavior: "smooth" })}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-lg leading-none shadow-sm"
                >
                  ›
                </button>
              </>
            )}
          </div>
          <DragOverlay>
            {activeItem && (
              <div className="w-[17rem] rounded-md border bg-background px-2.5 py-2 shadow-lg">
                <CardBody item={activeItem} showOwner={isTeam && !onlyMine} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <Dialog open={!!pendingInstall} onOpenChange={(open) => !open && cancelInstall()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Когда монтаж?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingLines?.title}
            {pendingLines?.address ? ` · ${pendingLines.address}` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setInstallValue(almatyPreset(1))}>
              Завтра
            </Button>
            <Button variant="outline" size="sm" onClick={() => setInstallValue(almatyPreset(2))}>
              Послезавтра
            </Button>
          </div>
          <Input type="datetime-local" value={installValue} onChange={(e) => setInstallValue(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" disabled={savingDate} onClick={() => confirmInstall(false)}>
              Без даты
            </Button>
            <Button disabled={savingDate || !installValue} onClick={() => confirmInstall(true)}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewClientDialog open={showNewDialog} onOpenChange={setShowNewDialog} onCreated={handleClientCreated} />
    </div>
  );
}
