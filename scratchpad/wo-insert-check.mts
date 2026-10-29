// Проверка (30.10.2026): вставка и LED-лента попадают в авто-строки наряда.
// npx tsx --tsconfig tsconfig.json scratchpad/wo-insert-check.mts
import { autoWorkOrderLines } from "@/lib/work-order-lines";
import type { CalculationResult } from "@/lib/types";

const item = (itemCode: string, itemName: string, quantity: number, unit = "м.п.") =>
  ({ itemCode, itemName, quantity, unit, unitPrice: 100, total: 100 * quantity });

// 1) КП из мобилки до 30.10: installerItems без вставки
const oldMobile = {
  roomResults: [{
    roomId: "r1", roomName: "Зал", area: 20, perimeter: 18,
    items: [item("canvas", "Полотно", 20, "м²"), item("profile", "Профиль пластиковый", 18), item("custom", "Вставка", 18), item("custom", "LED-подсветка для подшторника", 3)],
    installerItems: [item("custom", "Монтаж полотна", 20, "м²"), item("custom", "Монтаж профиля", 18)],
    subtotal: 0, heightMultiplied: false, subtotalAfterHeight: 0,
  }],
  extraItems: [], subtotal: 0, total: 0, minOrderApplied: false,
} as unknown as CalculationResult;

// 2) КП из мобилки после 30.10: «Монтаж вставки» уже есть — дубля быть не должно
const newMobile = {
  ...oldMobile,
  roomResults: [{
    ...(oldMobile.roomResults[0] as object),
    installerItems: [item("custom", "Монтаж полотна", 20, "м²"), item("custom", "Монтаж профиля", 18), item("custom", "Монтаж вставки", 18), item("custom", "Монтаж LED-подсветки", 3)],
  }],
} as unknown as CalculationResult;

// 3) КП, посчитанное на сайте: installerItems нет, вставка по коду insert
const site = {
  roomResults: [{
    roomId: "r1", roomName: "Кухня", area: 10, perimeter: 13,
    items: [item("canvas_320", "Полотно", 10, "м²"), item("profile_plastic", "Профиль", 13), item("insert", "Вставка", 13), item("spot_ours", "Софиты", 4, "шт.")],
    subtotal: 0, heightMultiplied: false, subtotalAfterHeight: 0,
  }],
  extraItems: [], subtotal: 0, total: 0, minOrderApplied: false,
} as unknown as CalculationResult;

const show = (title: string, calc: CalculationResult) => {
  console.log(`\n${title}`);
  for (const l of autoWorkOrderLines(calc, { install_profile: 300, install_canvas: 800, install_spot: 1000 })) console.log("  ", l.key, "|", l.name, "|", l.qty, l.unit, "×", l.price, l.code ?? "");
};
show("старая мобилка", oldMobile);
show("новая мобилка", newMobile);
show("сайт", site);
