"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Pencil, Plus, Trash2, Check, X, Replace, Pen } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/components/currency-provider";
import { unitLabel } from "@/lib/currency";
import { PRODUCT_ITEMS } from "@/lib/constants";
import type { LineItem, RoomResult } from "@/lib/types";

/** Позиция каталога для «Добавить позицию» и «Сменить тип» — из прайса мастера. */
export type CatalogPick = {
  code: string;
  /** Имя строки прайса мастера — так же строку называет приложение. */
  name: string;
  unit: string;
  category: string;
  /** Цена мастера в его валюте (нет строки в прайсе — дефолт каталога в этой валюте). */
  price: number;
  installerPrice: number | null;
};

/** Без прайса (старый вызов) — дефолты каталога, как было. */
const DEFAULT_PICKS: CatalogPick[] = PRODUCT_ITEMS.filter(
  (p) => p.category !== "install" && p.category !== "special"
).map((p) => ({ code: p.code, name: p.name, unit: p.unit, category: p.category, price: p.defaultPrice, installerPrice: null }));

/**
 * Строка КП из позиции каталога. На КП с посредником позиция входит с той же наценкой,
 * что и остальные — иначе одна строка будет «голой» (ручную правку цены в строке не
 * трогаем: мастер видит уже наценённую). Ставка монтажа — из прайса, если задана.
 */
function lineFromPick(pick: CatalogPick, partnerCoef: number): LineItem {
  const unitPrice = partnerCoef === 1 ? pick.price : Math.round((pick.price * partnerCoef) / 10) * 10;
  return {
    itemCode: pick.code,
    itemName: pick.name,
    quantity: 1,
    unit: pick.unit,
    unitPrice,
    total: unitPrice,
    ...(pick.installerPrice != null && { installerRate: pick.installerPrice }),
  };
}

interface ItemsEditorProps {
  estimateId: string;
  initialRoomResults: RoomResult[];
  initialExtraItems: LineItem[];
  /** Коэффициент посредника: цены в КП уже умножены на него (1 = посредника нет) */
  partnerCoef?: number;
  /** Каталог из прайса мастера (скрытые уже убраны). */
  catalog?: CatalogPick[];
}

export function ItemsEditor({
  estimateId,
  initialRoomResults,
  initialExtraItems,
  partnerCoef = 1,
  catalog = DEFAULT_PICKS,
}: ItemsEditorProps) {
  const router = useRouter();
  const { format: formatPrice } = useCurrency(); // валюта мастера (07.10.2026)
  const [editing, setEditing] = useState(false);
  const [rooms, setRooms] = useState<RoomResult[]>(initialRoomResults);
  const [extras, setExtras] = useState<LineItem[]>(initialExtraItems);
  const [pending, startTransition] = useTransition();
  const [adderRoomId, setAdderRoomId] = useState<string | null>(null);
  const [adderTarget, setAdderTarget] = useState<"extras" | null>(null);

  const totals = useMemo(() => {
    const recalcRoom = (rr: RoomResult): RoomResult => {
      const items = rr.items.map((it) => ({
        ...it,
        total: Math.round(it.quantity * it.unitPrice),
      }));
      const subtotal = items.reduce((s, it) => s + it.total, 0);
      const subtotalAfterHeight = rr.heightMultiplied
        ? Math.round(subtotal * 1.3)
        : Math.round(subtotal);
      return { ...rr, items, subtotal, subtotalAfterHeight };
    };
    const updatedRooms = rooms.map(recalcRoom);
    const updatedExtras = extras.map((it) => ({
      ...it,
      total: Math.round(it.quantity * it.unitPrice),
    }));
    const total =
      updatedRooms.reduce((s, r) => s + r.subtotalAfterHeight, 0) +
      updatedExtras.reduce((s, it) => s + it.total, 0);
    return { rooms: updatedRooms, extras: updatedExtras, total };
  }, [rooms, extras]);

  function updateItem(
    roomIdx: number,
    itemIdx: number,
    patch: Partial<LineItem>
  ) {
    setRooms((prev) =>
      prev.map((rr, i) =>
        i !== roomIdx
          ? rr
          : {
              ...rr,
              items: rr.items.map((it, j) =>
                j !== itemIdx ? it : { ...it, ...patch }
              ),
            }
      )
    );
  }

  function deleteItem(roomIdx: number, itemIdx: number) {
    setRooms((prev) =>
      prev.map((rr, i) =>
        i !== roomIdx
          ? rr
          : { ...rr, items: rr.items.filter((_, j) => j !== itemIdx) }
      )
    );
  }

  function addItemToRoom(roomIdx: number, line: LineItem) {
    setRooms((prev) =>
      prev.map((rr, i) =>
        i !== roomIdx ? rr : { ...rr, items: [...rr.items, line] }
      )
    );
    setAdderRoomId(null);
  }

  function updateExtra(idx: number, patch: Partial<LineItem>) {
    setExtras((prev) =>
      prev.map((it, i) => (i !== idx ? it : { ...it, ...patch }))
    );
  }

  function deleteExtra(idx: number) {
    setExtras((prev) => prev.filter((_, i) => i !== idx));
  }

  function addExtra(line: LineItem) {
    setExtras((prev) => [...prev, line]);
    setAdderTarget(null);
  }

  function cancelEdit() {
    setRooms(initialRoomResults);
    setExtras(initialExtraItems);
    setEditing(false);
    setAdderRoomId(null);
    setAdderTarget(null);
  }

  function saveChanges() {
    startTransition(async () => {
      const res = await fetch(`/api/estimates/${estimateId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomResults: totals.rooms,
          extraItems: totals.extras,
        }),
      });
      if (!res.ok) {
        toast.error("Не удалось сохранить");
        return;
      }
      toast.success("Изменения сохранены");
      setEditing(false);
      setAdderRoomId(null);
      setAdderTarget(null);
      router.refresh();
    });
  }

  const hasContent = rooms.length > 0 || extras.length > 0;
  if (!hasContent) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Детализация
          {totals.rooms.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totals.rooms.length} помещений)
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                disabled={pending}
              >
                <X className="h-4 w-4 mr-1" />
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={saveChanges}
                disabled={pending}
                className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              >
                <Check className="h-4 w-4 mr-1" />
                {pending ? "Сохраняю..." : "Сохранить"}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Править
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {totals.rooms.map((rr, roomIdx) => (
          <div key={rr.roomId ?? roomIdx} className="space-y-1">
            <div className="flex justify-between items-baseline gap-2">
              <p className="text-sm font-semibold flex-1 min-w-0">
                {rr.roomName}
                {rr.area > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({rr.area.toFixed(1)} м²)
                  </span>
                )}
              </p>
              {!editing && (
                <Link
                  href={`/dashboard/estimates/${estimateId}/edit-room/${roomIdx}`}
                  className="inline-flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline whitespace-nowrap"
                  title="Открыть чертёж комнаты"
                >
                  <Pen className="h-3 w-3" />
                  Чертёж
                </Link>
              )}
              <p className="text-sm font-bold whitespace-nowrap">
                {formatPrice(rr.subtotalAfterHeight)}
              </p>
            </div>
            <div className="space-y-1">
              {rr.items.map((item, itemIdx) => (
                <ItemRow
                  partnerCoef={partnerCoef}
                  catalog={catalog}
                  key={itemIdx}
                  item={item}
                  editing={editing}
                  onChange={(patch) => updateItem(roomIdx, itemIdx, patch)}
                  onDelete={() => deleteItem(roomIdx, itemIdx)}
                />
              ))}
              {editing && adderRoomId === (rr.roomId ?? String(roomIdx)) ? (
                <ItemAdder
                  catalog={catalog}
                  partnerCoef={partnerCoef}
                  onAdd={(line) => addItemToRoom(roomIdx, line)}
                  onCancel={() => setAdderRoomId(null)}
                />
              ) : editing ? (
                <button
                  type="button"
                  onClick={() =>
                    setAdderRoomId(rr.roomId ?? String(roomIdx))
                  }
                  className="text-xs text-[#1e3a5f] hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Добавить позицию
                </button>
              ) : null}
              {rr.heightMultiplied && (
                <p className="text-xs text-amber-600">
                  × 1.3 (высота &gt; 3м)
                </p>
              )}
            </div>
          </div>
        ))}

        {(totals.extras.length > 0 || editing) && (
          <div className="pt-3 border-t">
            <p className="text-sm font-semibold mb-2">Дополнительно</p>
            <div className="space-y-1">
              {totals.extras.map((item, idx) => (
                <ItemRow
                  partnerCoef={partnerCoef}
                  catalog={catalog}
                  key={idx}
                  item={item}
                  editing={editing}
                  onChange={(patch) => updateExtra(idx, patch)}
                  onDelete={() => deleteExtra(idx)}
                />
              ))}
              {editing && adderTarget === "extras" ? (
                <ItemAdder
                  catalog={catalog}
                  partnerCoef={partnerCoef}
                  onAdd={addExtra}
                  onCancel={() => setAdderTarget(null)}
                />
              ) : editing ? (
                <button
                  type="button"
                  onClick={() => setAdderTarget("extras")}
                  className="text-xs text-[#1e3a5f] hover:underline mt-1 inline-flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Добавить позицию
                </button>
              ) : null}
            </div>
          </div>
        )}

        {editing && (
          <div className="pt-3 border-t flex justify-between items-baseline">
            <span className="text-sm font-semibold">Итого (после правок)</span>
            <span className="text-lg font-bold">
              {formatPrice(totals.total)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ItemRowProps {
  item: LineItem;
  editing: boolean;
  onChange: (patch: Partial<LineItem>) => void;
  onDelete: () => void;
  partnerCoef: number;
  catalog: CatalogPick[];
}

function ItemRow({ item, editing, onChange, onDelete, partnerCoef, catalog }: ItemRowProps) {
  const { format: formatPrice, symbol } = useCurrency();
  const [showSwap, setShowSwap] = useState(false);
  // Локальные строковые значения — чтобы пользователь мог стереть всё
  // и набрать заново, без залипания на «0».
  const [qtyStr, setQtyStr] = useState<string>(String(item.quantity ?? ""));
  const [priceStr, setPriceStr] = useState<string>(String(item.unitPrice ?? ""));
  // Если item обновился извне (после Сохранить → router.refresh) — синхронизируем.
  useEffect(() => {
    setQtyStr(String(item.quantity ?? ""));
  }, [item.quantity]);
  useEffect(() => {
    setPriceStr(String(item.unitPrice ?? ""));
  }, [item.unitPrice]);

  if (!editing) {
    return (
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {item.itemName}
          <span className="ml-1 text-muted-foreground/60">
            {item.quantity} {unitLabel(item.unit, symbol)} × {formatPrice(item.unitPrice)}
          </span>
        </span>
        <span className="font-medium text-foreground">
          {formatPrice(item.total)}
        </span>
      </div>
    );
  }

  // Подбираем альтернативы из той же категории каталога — чтобы поменять
  // "Споты GX53 (наши)" на "Споты клиентские" одним кликом.
  // Категория текущей строки — по каталогу; сама строка может быть скрыта в прайсе.
  const currentCategory = PRODUCT_ITEMS.find((p) => p.code === item.itemCode)?.category;
  const alternatives = currentCategory
    ? catalog.filter((p) => p.category === currentCategory && p.code !== item.itemCode)
    : [];

  function applySwap(code: string) {
    const target = catalog.find((p) => p.code === code);
    if (!target) return;
    const line = lineFromPick(target, partnerCoef);
    // Ставку монтажа прежней позиции не тащим на новую: у новой своя или по умолчанию.
    onChange({
      itemCode: line.itemCode,
      itemName: line.itemName,
      unit: line.unit,
      unitPrice: line.unitPrice,
      installerRate: line.installerRate,
    });
    setShowSwap(false);
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs">
      <Input
        type="text"
        value={item.itemName}
        onChange={(e) => onChange({ itemName: e.target.value })}
        className="h-8 text-xs"
      />
      {alternatives.length > 0 && (
        <button
          type="button"
          onClick={() => setShowSwap((v) => !v)}
          className="text-[#1e3a5f] hover:bg-muted p-1 rounded"
          aria-label="Сменить тип"
          title="Сменить тип"
        >
          <Replace className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="text-red-600 hover:text-red-700 p-1"
        aria-label="Удалить"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {showSwap && alternatives.length > 0 && (
        <div className="col-span-3 rounded-md border bg-muted/30 p-1.5 space-y-1">
          <p className="text-[10px] text-muted-foreground px-1">
            Заменить на:
          </p>
          <div className="grid grid-cols-1 gap-1">
            {alternatives.map((alt) => (
              <button
                key={alt.code}
                type="button"
                onClick={() => applySwap(alt.code)}
                className="text-left px-2 py-1 text-xs rounded hover:bg-background border border-transparent hover:border-border"
              >
                {alt.name}
                <span className="text-muted-foreground/70 ml-1">
                  ({formatPrice(alt.price)}/{unitLabel(alt.unit, symbol)})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5 col-span-3">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">
            Кол-во ({unitLabel(item.unit, symbol)})
          </label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={qtyStr}
            onChange={(e) => {
              const v = e.target.value;
              setQtyStr(v);
              const num = parseFloat(v);
              onChange({ quantity: Number.isFinite(num) ? num : 0 });
            }}
            onFocus={(e) => e.target.select()}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">
            Цена
          </label>
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={priceStr}
            onChange={(e) => {
              const v = e.target.value;
              setPriceStr(v);
              const num = parseFloat(v);
              onChange({ unitPrice: Number.isFinite(num) ? num : 0 });
            }}
            onFocus={(e) => e.target.select()}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-0.5">
            Итого
          </label>
          <div className="h-8 px-2 flex items-center text-xs font-semibold border rounded-md bg-muted/40">
            {formatPrice(Math.round(item.quantity * item.unitPrice))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ItemAdderProps {
  catalog: CatalogPick[];
  partnerCoef: number;
  onAdd: (line: LineItem) => void;
  onCancel: () => void;
}

function ItemAdder({ catalog, partnerCoef, onAdd, onCancel }: ItemAdderProps) {
  const { format: formatPrice, symbol } = useCurrency();
  const [mode, setMode] = useState<"catalog" | "custom">(catalog.length > 0 ? "catalog" : "custom");
  const [selectedCode, setSelectedCode] = useState<string>(catalog[0]?.code ?? "");
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("шт.");
  const [customPrice, setCustomPrice] = useState("0");

  function handleAdd() {
    if (mode === "catalog") {
      const pick = catalog.find((p) => p.code === selectedCode);
      if (!pick) return;
      onAdd(lineFromPick(pick, partnerCoef));
    } else {
      const price = parseFloat(customPrice) || 0;
      const name = customName.trim();
      if (!name) return;
      // Как раньше: наценка посредника ложится и на свою позицию.
      onAdd(lineFromPick({ code: `custom_${Date.now()}`, name, unit: customUnit, category: "custom", price, installerPrice: null }, partnerCoef));
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2">
      <div className="flex gap-1.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("catalog")}
          className={`px-2 py-1 rounded ${
            mode === "catalog"
              ? "bg-[#1e3a5f] text-white"
              : "hover:bg-muted"
          }`}
        >
          Из каталога
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`px-2 py-1 rounded ${
            mode === "custom"
              ? "bg-[#1e3a5f] text-white"
              : "hover:bg-muted"
          }`}
        >
          Своя позиция
        </button>
      </div>
      {mode === "catalog" ? (
        <select
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
          className="w-full h-8 text-xs border rounded-md px-2 bg-background"
        >
          {catalog.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name} — {formatPrice(p.price)}/{unitLabel(p.unit, symbol)}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          <Input
            placeholder="Название"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="h-8 text-xs col-span-2"
          />
          <Input
            placeholder="ед."
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Цена"
            value={customPrice}
            onChange={(e) => setCustomPrice(e.target.value)}
            className="h-8 text-xs col-span-3"
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          size="sm"
          onClick={handleAdd}
          className="bg-[#1e3a5f] hover:bg-[#152d4a]"
        >
          Добавить
        </Button>
      </div>
    </div>
  );
}
