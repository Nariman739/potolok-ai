"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
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
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCurrency } from "@/components/currency-provider";
import { useClock } from "@/components/use-clock";
import { dayShort } from "@/lib/crm-calendar";
import { CRM_COLUMNS, CRM_COLUMN_LABELS, isCrmColumn, type CrmColumn } from "@/lib/crm-columns";
import type { BoardItem } from "@/lib/crm-board";
import { clientLines, useStageMove } from "@/components/clients/use-stage-move";
import { CLIENTS_VIEW_KEY, ClientsHeader } from "./clients-header";
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function CardBody({ item, showOwner }: { item: BoardItem; showOwner: boolean }) {
  const { format: formatMoney } = useCurrency();
  const clock = useClock();
  const { title, phone, address } = clientLines(item);
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
              {item.date.kind === "install" ? "Монтаж" : "Замер"} {dayShort(clock.day(new Date(item.date.at)))}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function DraggableCard({ item, showOwner }: { item: BoardItem; showOwner: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <Link
      ref={setNodeRef}
      href={`/dashboard/clients/${item.id}`}
      draggable={false}
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

// Выбранный этап переживает переход в карточку клиента и назад (в рамках вкладки).
// sessionStorage как внешнее хранилище: на сервере этапа нет, гидратация не расходится.
const MOBILE_COLUMN_KEY = "clients-board-col-v1";
const columnListeners = new Set<() => void>();
function readMobileColumn(): CrmColumn | null {
  try {
    const v = sessionStorage.getItem(MOBILE_COLUMN_KEY);
    return isCrmColumn(v) ? v : null;
  } catch {
    return null;
  }
}
function subscribeMobileColumn(cb: () => void) {
  columnListeners.add(cb);
  return () => {
    columnListeners.delete(cb);
  };
}
function writeMobileColumn(c: CrmColumn) {
  try {
    sessionStorage.setItem(MOBILE_COLUMN_KEY, c);
  } catch {}
  columnListeners.forEach((fn) => fn());
}

/**
 * Канбан на телефоне: один этап за раз, сверху чипы этапов со счётчиками, свайп влево/вправо
 * листает этапы, перенос — через «⋯» на карточке. Данные и перенос те же, что у доски.
 */
function MobileBoard({
  byColumn,
  showOwner,
  onMove,
}: {
  byColumn: Map<CrmColumn, BoardItem[]>;
  showOwner: boolean;
  onMove: (item: BoardItem, target: CrmColumn) => void;
}) {
  const saved = useSyncExternalStore(subscribeMobileColumn, readMobileColumn, () => null);
  // Локальное состояние — на случай, если sessionStorage недоступен (приватный режим)
  const [local, setLocal] = useState<CrmColumn | null>(null);
  const column: CrmColumn = local ?? saved ?? "new";
  const [moving, setMoving] = useState<BoardItem | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  function select(next: CrmColumn) {
    setLocal(next);
    writeMobileColumn(next);
  }

  useEffect(() => {
    chipsRef.current
      ?.querySelector<HTMLElement>(`[data-mchip="${column}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [column]);

  function shift(delta: number) {
    const i = CRM_COLUMNS.indexOf(column);
    const next = CRM_COLUMNS[Math.min(CRM_COLUMNS.length - 1, Math.max(0, i + delta))];
    if (next !== column) select(next);
  }

  // Горизонтальный свайп по списку — соседний этап; вертикальный — обычная прокрутка
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
  }

  const all = byColumn.get(column)!;
  const shown = TAIL_COLUMNS.includes(column) ? all.slice(0, TAIL_LIMIT) : all;
  const movingLines = moving ? clientLines(moving) : null;

  return (
    <div className="space-y-2 md:hidden">
      <div ref={chipsRef} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {CRM_COLUMNS.map((c) => {
          const active = c === column;
          return (
            <button
              key={c}
              data-mchip={c}
              aria-pressed={active}
              onClick={() => select(c)}
              className={`inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                active ? "border-[#1e3a5f] bg-[#1e3a5f] text-white" : "bg-background text-muted-foreground"
              }`}
            >
              {CRM_COLUMN_LABELS[c]}
              <span className={`font-semibold ${active ? "text-white/80" : ""}`}>{byColumn.get(c)!.length}</span>
            </button>
          );
        })}
      </div>

      <div data-mobile-column={column} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="min-h-[50vh] space-y-1.5">
        {shown.length === 0 && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            В этапе «{CRM_COLUMN_LABELS[column]}» пока пусто. Перенести сюда клиента можно через «⋯» на его карточке.
          </p>
        )}
        {shown.map((item) => (
          <div key={item.id} data-mcard={item.id} className="flex items-stretch rounded-md border bg-background">
            <Link href={`/dashboard/clients/${item.id}`} className="min-w-0 flex-1 px-2.5 py-2">
              <CardBody item={item} showOwner={showOwner} />
            </Link>
            <button
              type="button"
              aria-label="Перенести на другой этап"
              onClick={() => setMoving(item)}
              className="flex w-10 flex-shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        ))}
        {all.length > shown.length && (
          <p className="px-1 py-1 text-center text-xs text-muted-foreground">
            Показаны последние {shown.length} из {all.length}
          </p>
        )}
      </div>

      <Dialog open={!!moving} onOpenChange={(open) => !open && setMoving(null)}>
        <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Перенести в …</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {movingLines?.title}
            {movingLines?.address ? ` · ${movingLines.address}` : ""}
          </p>
          <div className="grid gap-1">
            {moving &&
              CRM_COLUMNS.filter((c) => c !== moving.column).map((c) => (
                <button
                  key={c}
                  type="button"
                  data-move={c}
                  onClick={() => {
                    const item = moving;
                    setMoving(null);
                    onMove(item, c);
                  }}
                  className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {CRM_COLUMN_LABELS[c]}
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
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
  const [canScrollRight, setCanScrollRight] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  // Отпускание карточки не должно считаться кликом и открывать клиента
  const suppressClick = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Открытая доска = выбранный вид: «К клиентам» из карточки возвращает сюда, а не в список
  useEffect(() => {
    try {
      localStorage.setItem(CLIENTS_VIEW_KEY, "board");
    } catch {}
  }, []);

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

  // Только на document и в capture: dnd-kit глушит click там же, React до него не доходит,
  // и без preventDefault браузер переходит по ссылке карточки, отпущенной на своём месте.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (suppressClick.current) e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

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

  // По курсору: карточка шире развёрнутой пустой колонки и иначе падала в соседнюю.
  // И только внутри доски: прокрученные колонки лежат и под боковым меню, в них падать нельзя.
  const collisionDetection: CollisionDetection = (args) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const p = args.pointerCoordinates;
    if (!rect || !p || p.x < rect.left || p.x > rect.right || p.y < rect.top || p.y > rect.bottom) return [];
    return pointerWithin(args);
  };

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
    // click приходит после pointerup, держим с запасом на перерисовку доски
    setTimeout(() => {
      suppressClick.current = false;
    }, 300);
  }

  // Один путь переноса для drag-and-drop, меню «⋯» на телефоне и карточки клиента
  const { requestMove, installDialog } = useStageMove({
    onColumn: setColumn,
    onInstallAt: (id, installAt) =>
      setItems((list) =>
        list.map((i) => {
          if (i.id !== id) return i;
          if (installAt) return { ...i, installAt, date: { kind: "install", at: installAt } };
          return { ...i, installAt: null, date: i.date?.kind === "install" ? null : i.date };
        }),
      ),
  });

  function onDragEnd(e: DragEndEvent) {
    releaseClick();
    const target = e.over?.id;
    const item = items.find((i) => i.id === e.active.id);
    if (!item || !isCrmColumn(target)) return;
    requestMove(item, target);
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

      {/* На телефоне drag-and-drop с touch-none мешает прокрутке, и 12 колонок негде показать — один этап за раз */}
      <MobileBoard byColumn={byColumn} showOwner={isTeam && !onlyMine} onMove={requestMove} />

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
          collisionDetection={collisionDetection}
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
                      <DraggableCard key={item.id} item={item} showOwner={isTeam && !onlyMine} />
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

      {installDialog}

      <NewClientDialog open={showNewDialog} onOpenChange={setShowNewDialog} onCreated={handleClientCreated} />
    </div>
  );
}
