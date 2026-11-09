/** Рекурсивно убирает из расчёта всё, что начинается на installer/partner/cost/margin. */
export function stripInternalPrices(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalPrices);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(installer|partner|margin|costPrice|purchase)/i.test(k)) continue;
      out[k] = stripInternalPrices(v);
    }
    return out;
  }
  return value;
}
