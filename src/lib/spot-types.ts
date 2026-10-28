/**
 * Типы софитов (Нариман 28.10.2026).
 *
 * Раньше у «нашего» софита типа не было: все софиты комнаты шли одной строкой
 * КП, а вариант из прайса выбирался на всю комнату (room.variantOverrides.spot).
 * Абзал из-за этого весь свет писал в КП руками («Сафиты скрытые 18 × 7000»).
 *
 * Теперь тип хранится НА ЭЛЕМЕНТЕ чертежа:
 *   - `spotType`       — код стандартного типа из каталога (spot_ours = GX53, spot_bh53, spot_bh10);
 *   - `priceVariantId` — свой софит мастера из прайса (PriceVariant/PriceItem id).
 * Элемент без того и другого — «как раньше»: вариант комнаты или GX53. Так старые
 * замеры и КП не меняют сумму.
 *
 * Файл общий для мобилки и сайта — менять синхронно.
 */

export const STANDARD_SPOT_CODES = ["spot_ours", "spot_bh53", "spot_bh10"] as const;
export type StandardSpotCode = (typeof STANDARD_SPOT_CODES)[number];

/** Короткая подпись типа — на чертеже и в чипах. */
export const SPOT_SHORT_LABEL: Record<string, string> = {
  spot_ours: "GX53",
  spot_bh53: "BH53",
  spot_bh10: "BH10",
};

export function isStandardSpotCode(code: string | null | undefined): code is StandardSpotCode {
  return !!code && (STANDARD_SPOT_CODES as readonly string[]).includes(code);
}

/** Ключ типа: "t:<код>" — стандартный, "v:<id>" — свой вариант, null — без типа (старые замеры). */
export function spotTypeKey(el: { spotType?: string | null; priceVariantId?: string | null }): string | null {
  if (el.priceVariantId) return `v:${el.priceVariantId}`;
  if (el.spotType) return `t:${el.spotType}`;
  return null;
}

export type SpotTypeRef = { kind: "code"; code: string } | { kind: "variant"; variantId: string };

export function parseSpotTypeKey(key: string | null | undefined): SpotTypeRef | null {
  if (!key) return null;
  if (key.startsWith("t:")) return { kind: "code", code: key.slice(2) };
  if (key.startsWith("v:")) return { kind: "variant", variantId: key.slice(2) };
  return null;
}

/** Поля элемента под выбранный тип: одно задано, второе снято. null — тип убрать. */
export function spotFieldsForKey(key: string | null): { spotType: string | undefined; priceVariantId: string | undefined } {
  const ref = parseSpotTypeKey(key);
  if (!ref) return { spotType: undefined, priceVariantId: undefined };
  if (ref.kind === "code") return { spotType: ref.code, priceVariantId: undefined };
  return { spotType: undefined, priceVariantId: ref.variantId };
}

/** Короткая подпись по ключу: GX53 / BH53 / первые буквы названия своего варианта. */
export function shortSpotLabel(key: string | null, variantName?: string | null): string {
  const ref = parseSpotTypeKey(key);
  if (!ref) return SPOT_SHORT_LABEL.spot_ours;
  if (ref.kind === "code") return SPOT_SHORT_LABEL[ref.code] ?? ref.code;
  const n = (variantName ?? "").trim();
  return n.length > 6 ? n.slice(0, 6) : n || "•";
}
