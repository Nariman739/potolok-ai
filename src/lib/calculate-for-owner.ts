import { calculate } from "@/lib/calculate";
import { currencyFor } from "@/lib/company";
import { priceBookCompanyId, priceMapFor, customItemsMapFor, ownItemsByIdFor } from "@/lib/price-items";
import type { RoomInput, ExtraItem, CalculationResult } from "@/lib/types";

/**
 * Расчёт калькулятора сайта по ТЕКУЩЕМУ прайсу компании (владелец — scope.ownerId).
 * Один на «Рассчитать» (POST /api/calculate) и на пересчёт при сохранении КП
 * (POST /api/estimates, поле recalc) — чтобы сохранённое КП не могло разойтись с тем,
 * что сервер посчитал бы сейчас (13.11.2026).
 */
export async function calculateForOwner(
  ownerId: string,
  rooms: RoomInput[],
  extraItems?: ExtraItem[],
): Promise<CalculationResult> {
  // Прайс компании — PriceItem («Мой прайс», 01.10.2026)
  const companyId = await priceBookCompanyId(ownerId);
  const currency = await currencyFor(ownerId);
  const priceMap = await priceMapFor(companyId, currency);
  const customItemsMap = await customItemsMapFor(companyId);
  const ownItemsById = await ownItemsByIdFor(companyId);
  return calculate(rooms, priceMap, customItemsMap, extraItems, ownItemsById, currency);
}
