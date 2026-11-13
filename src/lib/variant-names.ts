import { prisma } from "./prisma";

/**
 * Имена своих позиций прайса для 3D у клиента (13.11.2026).
 *
 * Scene3D по названию своей позиции решает, каким софитом/треком её рисовать
 * (fixtureKinds: «BH53», «BH10/GU10», «накладной»). В кабинете мастера имена приходят из
 * /api/prices/variants, а он под логином: у клиента на /z и /kp/3d и у воркера «Фото
 * клиенту» запрос давал 401, и свой BH53 рисовался обычным GX53. Поэтому публичные
 * страницы получают имена с сервера вместе с комнатой.
 *
 * Наружу уходит ТОЛЬКО id → имя (имя клиент и так видит в КП): ни цен, ни фото.
 * Правило отбора — как у /api/prices/variants (isOwnVariant, живые), чтобы клиент видел
 * ровно то же, что мастер; и только из прайса компании объекта или своей компании автора —
 * id чужой позиции, вписанный в чертёж, имени не вернёт.
 */
export type VariantNameMap = Record<string, { name: string }>;

export function variantIdsOf(elements: unknown): string[] {
  if (!Array.isArray(elements)) return [];
  const ids = new Set<string>();
  for (const el of elements) {
    const id = (el as { priceVariantId?: unknown } | null)?.priceVariantId;
    if (typeof id === "string" && id.length > 0 && id.length <= 80) ids.add(id);
  }
  return [...ids].slice(0, 200);
}

export async function variantNamesFor(
  elements: unknown,
  owner: { masterId: string; companyId?: string | null },
): Promise<VariantNameMap> {
  const ids = variantIdsOf(elements);
  if (ids.length === 0) return {};
  const rows = await prisma.priceItem.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      filmKey: null,
      templateCode: null,
      code: { startsWith: "own:" },
      NOT: { category: "custom" },
      company: { OR: [...(owner.companyId ? [{ id: owner.companyId }] : []), { ownerId: owner.masterId }] },
    },
    select: { id: true, name: true },
  });
  const out: VariantNameMap = {};
  for (const r of rows) out[r.id] = { name: r.name };
  return out;
}
