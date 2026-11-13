// Только чтение: КП за 30 дней — installer-pdf (логика сайта) против наряда (autoWorkOrderLines)
import { prisma } from "@/lib/prisma";
import { autoWorkOrderLines, workOrderTotal, INSTALL_MAP, installSeenKey } from "@/lib/work-order-lines";
import { priceMapFor } from "@/lib/price-items";
// Только чтение: компанию прайса ищем, НЕ ensureOwnCompany (та создаёт компанию).
const bookOf = async (companyId: string | null, masterId: string) => companyId ?? (await prisma.company.findUnique({ where: { ownerId: masterId }, select: { id: true } }))?.id ?? null;
import { defaultPricesFor } from "@/lib/constants";
const keep = setInterval(() => {}, 1000);
function oldTotal(calc: any, prices: Record<string, number>, cur: string) {
  const d = defaultPricesFor(cur) as Record<string, number>;
  const rrs = calc?.roomResults ?? calc?.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
  let t = 0;
  for (const rr of rrs) {
    const seen = new Set<string>();
    for (const item of rr.items ?? []) {
      if (item.installerName) { const p = Math.max(0, Math.round(item.installerRate ?? 0)); if (p > 0 && item.quantity > 0) t += item.quantity * p; continue; }
      const code = item.installCode ?? INSTALL_MAP[item.itemCode]; if (!code) continue;
      const k = installSeenKey(code, item.itemCode); if (seen.has(k)) continue; seen.add(k);
      const p = item.installerRate ?? (item.itemCode === "corner_rounded" ? Math.round(item.unitPrice * 0.3) : (prices[code] ?? d[code] ?? 0));
      if (p <= 0) continue; t += item.quantity * p;
    }
  }
  return Math.round(t);
}
(async () => {
  try {
    const since = new Date(Date.now() - 30 * 864e5);
    const es = await prisma.estimate.findMany({ where: { createdAt: { gte: since }, deletedAt: null }, select: { id: true, masterId: true, companyId: true, calculationData: true, master: { select: { currency: true } } } });
    const cache = new Map<string, Record<string, number>>();
    let mobile = 0, site = 0, diffM = 0, diffS = 0, spots0 = 0; const ex: string[] = [];
    for (const e of es) {
      const calc = e.calculationData as any; if (!calc) continue;
      const cur = e.master.currency || "KZT";
      if (!cache.has(e.masterId)) cache.set(e.masterId, await (async () => { const b = await bookOf(e.companyId, e.masterId); return b ? priceMapFor(b, cur) : {}; })());
      const prices = cache.get(e.masterId)!;
      const rrs = calc.roomResults ?? calc.variants?.find((v: any) => v.type === "standard")?.rooms ?? [];
      const isMobile = rrs.some((r: any) => Array.isArray(r.installerItems) && r.installerItems.length > 0);
      const a = oldTotal(calc, prices, cur), b = workOrderTotal(autoWorkOrderLines(calc, prices, cur));
      const spotsInItems = rrs.some((r: any) => (r.items ?? []).some((i: any) => /spot|софит/i.test(`${i.itemCode} ${i.itemName}`)));
      if (isMobile && spotsInItems && !(calc.totalSpots > 0)) spots0++;
      if (isMobile) { mobile++; if (a !== b) { diffM++; if (ex.length < 6) ex.push(`${e.id.slice(0, 8)} pdf ${a} vs наряд ${b}`); } }
      else { site++; if (a !== b) { diffS++; const L = autoWorkOrderLines(calc, prices, cur); console.log("SITE", e.id.slice(0,8), a, b, JSON.stringify(L.filter(l => l.key.startsWith("extra")).map(l => [l.name, l.qty, l.price])), JSON.stringify((calc.extraItems??[]).map((x:any)=>[x.itemName,x.installerPrice]))); } }
    }
    console.log({ всего: es.length, мобилка: mobile, мобилка_расхождение: diffM, сайт: site, сайт_расхождение: diffS, мобилка_софиты_но_totalSpots0: spots0 });
    console.log(ex.join("\n"));
  } catch (err) { console.log("ERR", err); }
  clearInterval(keep); process.exit(0);
})();
