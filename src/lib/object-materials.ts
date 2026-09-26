import { PRODUCT_ITEMS, type ProductCategory } from "@/lib/constants";
import type { CalculationResult } from "@/lib/types";

/**
 * «Взять на объект» — материалы по всему объекту одной таблицей (26.09.2026).
 *
 * Нариман с замера: «хотел взять чисто багет, профиля и шурупы, без полотна —
 * сейчас считал по каждой комнате и складывал периметры». Все цифры уже есть
 * в КП, по комнатам; здесь они просто складываются по позиции. Работу
 * (монтаж) и коэффициенты в список не берём — в магазине они не нужны.
 */

export type MaterialLine = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  category: ProductCategory;
};

export type MaterialsSummary = {
  rooms: number;
  area: number;
  perimeter: number;
  lines: MaterialLine[];
};

/** В каком порядке мастер ходит по магазину: полотно, багет, свет, остальное. */
const ORDER: ProductCategory[] = [
  "canvas", "profile", "corner", "spot", "spot_pair", "chandelier", "track", "lightline",
  "curtain", "gardina", "podshtornik", "other",
];
const SKIP = new Set<string>(["install", "special"]);

const byCode = new Map(PRODUCT_ITEMS.map((p) => [p.code, p]));

export function summarizeMaterials(calc: CalculationResult | null | undefined): MaterialsSummary | null {
  if (!calc || !Array.isArray(calc.roomResults) || calc.roomResults.length === 0) return null;
  const acc = new Map<string, MaterialLine>();
  const add = (it: { itemCode: string; itemName: string; unit: string; quantity: number }) => {
    const known = byCode.get(it.itemCode);
    const category = (known?.category ?? "other") as ProductCategory;
    if (SKIP.has(category)) return;
    // Разовые позиции мастера («Люстра клиента», «Выезд») тоже кладём — он их
    // сам добавил, значит, они ему нужны.
    const key = it.itemCode || it.itemName;
    const line = acc.get(key);
    if (line) line.quantity += it.quantity;
    else acc.set(key, { code: it.itemCode, name: it.itemName, unit: it.unit, quantity: it.quantity, category });
  };
  let area = 0, perimeter = 0;
  for (const r of calc.roomResults) {
    area += r.area ?? 0;
    perimeter += r.perimeter ?? 0;
    for (const it of r.items ?? []) add(it);
  }
  for (const it of calc.extraItems ?? []) add(it);

  const lines = [...acc.values()]
    .map((l) => ({ ...l, quantity: Math.round(l.quantity * 100) / 100 }))
    .filter((l) => l.quantity > 0)
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));

  return {
    rooms: calc.roomResults.length,
    area: Math.round(area * 100) / 100,
    perimeter: Math.round(perimeter * 100) / 100,
    lines,
  };
}
