import { prisma } from "./prisma";
import { ensureOwnCompany, companyIdFor } from "./company";
import { DEFAULT_PRICES, PRODUCT_BY_CODE, PRODUCT_ITEMS } from "./constants";
import type { CustomItemInfo } from "./calculate";

/**
 * «Мой прайс» — одна таблица PriceItem вместо трёх механизмов (01.10.2026).
 *
 * Здесь: роли каталожных позиций, вывод роли для своих позиций, загрузка
 * прайса компании и ПРОЕКЦИИ в старые формы ответов (/prices, /prices/variants,
 * /custom-items), чтобы приложение в сторах и веб-кабинет продолжали работать
 * без изменений, пока экраны переезжают на новую модель.
 *
 * Прайс принадлежит компании (как и раньше читался у scope.ownerId).
 */

export {
  TEMPLATE_ROLES, CATEGORY_ROLES, VARIANT_CATEGORIES, EXTRA_NAME_RE, templateRole, inferRole,
} from "./price-roles";
export type { PriceRole, WallKind, RoleMeta } from "./price-roles";
import { templateRole, inferRole, parseRollWidthCm, type WallKind, type PriceRole } from "./price-roles";

// ------------------------------------------------------------------
// Загрузка
// ------------------------------------------------------------------

export type PriceItemRow = Awaited<ReturnType<typeof prisma.priceItem.findMany>>[number];

/** Компания, которой принадлежит прайс мастера-владельца (создаёт, если нет). */
export async function priceBookCompanyId(ownerId: string): Promise<string> {
  const own = await ensureOwnCompany(ownerId);
  return own.id;
}

/** Компания прайса для мастера без Scope под рукой (Telegram, ассистент): активная или своя. */
export async function priceBookCompanyIdForMaster(masterId: string): Promise<string> {
  return (await companyIdFor(masterId)) ?? priceBookCompanyId(masterId);
}

/** Все живые строки прайса компании. */
export async function loadPriceItems(companyId: string, opts?: { includeDeleted?: boolean }) {
  return prisma.priceItem.findMany({
    where: { companyId, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Цены по кодам каталога с дефолтами — замена паттерна «masterPrice.findMany + DEFAULT_PRICES». */
export async function priceMapFor(companyId: string): Promise<Record<string, number>> {
  const rows = await prisma.priceItem.findMany({
    where: { companyId, deletedAt: null, templateCode: { not: null } },
    select: { templateCode: true, price: true },
  });
  const map: Record<string, number> = { ...DEFAULT_PRICES };
  for (const r of rows) if (r.templateCode) map[r.templateCode] = r.price;
  return map;
}

/** Свои штучные позиции веб-калькулятора (бывший CustomItem) по коду. */
export async function customItemsMapFor(companyId: string): Promise<Record<string, CustomItemInfo>> {
  const rows = await prisma.priceItem.findMany({
    where: { companyId, deletedAt: null, category: "custom" },
    select: { code: true, name: true, unit: true, price: true },
  });
  const map: Record<string, CustomItemInfo> = {};
  for (const r of rows) map[r.code] = { code: r.code, name: r.name, unit: r.unit, price: r.price };
  return map;
}

// ------------------------------------------------------------------
// Проекции в старые ответы API
// ------------------------------------------------------------------

export type LegacyPriceItem = {
  code: string;
  name: string;
  unit: string;
  category: string;
  description?: string;
  defaultPrice: number;
  price: number;
  installerPrice: number | null;
  photoUrl: string | null;
  isHidden: boolean;
  isCustom: boolean;
  isCustomItem?: boolean;
  customItemId?: string;
};

/** Ответ старого GET /prices: каталог с переопределениями + бывшие CustomItem. */
export function legacyPricesView(rows: PriceItemRow[]): LegacyPriceItem[] {
  const byTemplate = new Map<string, PriceItemRow>();
  for (const r of rows) if (r.templateCode) byTemplate.set(r.templateCode, r);
  const items: LegacyPriceItem[] = PRODUCT_ITEMS.map((item) => {
    const row = byTemplate.get(item.code);
    return {
      code: item.code,
      // Полотно мастер может переименовать («Германская матовая») — отдаём его имя.
      name: row?.name ?? item.name,
      unit: item.unit,
      category: item.category,
      description: item.description,
      defaultPrice: item.defaultPrice,
      price: row?.price ?? item.defaultPrice,
      installerPrice: row?.installerPrice ?? null,
      photoUrl: row?.photoUrl ?? null,
      isHidden: row?.isHidden ?? false,
      isCustom: row != null && row.price !== item.defaultPrice,
    };
  });
  for (const r of rows) {
    if (r.category !== "custom") continue;
    items.push({
      code: r.code,
      name: r.name,
      unit: r.unit,
      category: "custom",
      description: undefined,
      defaultPrice: r.price,
      price: r.price,
      installerPrice: r.installerPrice ?? null,
      photoUrl: r.photoUrl ?? null,
      isHidden: r.isHidden,
      isCustom: false,
      isCustomItem: true,
      customItemId: r.id,
    });
  }
  return items;
}

export type LegacyVariant = {
  id: string;
  masterId: string;
  category: string;
  baseCode: string | null;
  name: string;
  unit: string;
  price: number;
  installerPrice: number | null;
  photoUrl: string | null;
  noInsert: boolean;
  sortOrder: number;
  physicalWidthMm: number | null;
  physicalHeightMm: number | null;
  colorHex: string | null;
  mountingType: string | null;
  glbModelUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  /** новое: роль и флаг «проверьте» — старые клиенты это поле игнорируют */
  role: string;
  needsReview: boolean;
  /** полотно: ширина рулона, см (null — любая) */
  maxWidthCm: number | null;
};

/** Своя позиция (не каталожная и не бывший CustomItem). */
export function isOwnVariant(r: PriceItemRow): boolean {
  return r.templateCode === null && r.category !== "custom" && r.code.startsWith("own:");
}

export function toLegacyVariant(r: PriceItemRow, masterId: string): LegacyVariant {
  const wk = (r.wallKind ?? {}) as WallKind;
  return {
    id: r.id,
    masterId,
    category: r.category ?? "other",
    baseCode: null,
    name: r.name,
    unit: r.unit,
    price: r.price,
    installerPrice: r.installerPrice ?? null,
    photoUrl: r.photoUrl ?? null,
    noInsert: wk.noInsert === true,
    sortOrder: r.sortOrder,
    physicalWidthMm: r.physicalWidthMm ?? null,
    physicalHeightMm: r.physicalHeightMm ?? null,
    colorHex: r.colorHex ?? null,
    mountingType: r.mountingType ?? null,
    glbModelUrl: r.glbModelUrl ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt ?? null,
    role: r.role,
    needsReview: r.needsReview,
    maxWidthCm: r.maxWidthCm ?? null,
  };
}

/** Ответ старого GET /prices/variants (порядок: категория, sortOrder, createdAt). */
export function legacyVariantsView(rows: PriceItemRow[], masterId: string, category?: string | null): LegacyVariant[] {
  return rows
    .filter(isOwnVariant)
    .filter((r) => !category || r.category === category)
    .map((r) => toLegacyVariant(r, masterId))
    .sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

// ------------------------------------------------------------------
// Запись
// ------------------------------------------------------------------

/** Каталожная позиция компании: цена/монтажнику/фото/скрытие (бывший MasterPrice.upsert). */
export async function upsertTemplateItem(
  companyId: string,
  code: string,
  data: { price?: number; installerPrice?: number | null; photoUrl?: string | null; isHidden?: boolean },
) {
  const tpl = PRODUCT_BY_CODE[code];
  if (!tpl) throw new Error(`Unknown template code ${code}`);
  const meta = templateRole(code);
  return prisma.priceItem.upsert({
    where: { companyId_code: { companyId, code } },
    update: data,
    create: {
      companyId,
      code,
      templateCode: code,
      role: meta.role,
      appliesTo: meta.appliesTo ?? [],
      wallKind: meta.wallKind ?? undefined,
      maxWidthCm: meta.maxWidthCm ?? null,
      category: tpl.category,
      name: tpl.name,
      unit: tpl.unit,
      price: data.price ?? tpl.defaultPrice,
      installerPrice: data.installerPrice ?? null,
      photoUrl: data.photoUrl ?? null,
      isHidden: data.isHidden ?? false,
    },
  });
}

/** Прайс новой компании: все каталожные позиции по дефолту (замена createMany MasterPrice при регистрации). */
export async function seedTemplateItems(companyId: string) {
  await prisma.priceItem.createMany({
    data: PRODUCT_ITEMS.map((tpl) => {
      const meta = templateRole(tpl.code);
      return {
        companyId,
        code: tpl.code,
        templateCode: tpl.code,
        role: meta.role,
        appliesTo: meta.appliesTo ?? [],
        wallKind: meta.wallKind ?? undefined,
        maxWidthCm: meta.maxWidthCm ?? null,
        category: tpl.category,
        name: tpl.name,
        unit: tpl.unit,
        price: tpl.defaultPrice,
      };
    }),
    skipDuplicates: true,
  });
}

export type OwnItemInput = {
  category: string;
  name: string;
  unit: string;
  price: number;
  installerPrice?: number | null;
  photoUrl?: string | null;
  sortOrder?: number;
  noInsert?: boolean;
  physicalWidthMm?: number | null;
  physicalHeightMm?: number | null;
  colorHex?: string | null;
  mountingType?: string | null;
  glbModelUrl?: string | null;
  /** полотно: ширина рулона, см; undefined — вывести из названия */
  maxWidthCm?: number | null;
};

/** Своя позиция (бывший PriceVariant.create). Роль — по категории и имени. */
export async function createOwnItem(companyId: string, input: OwnItemInput) {
  const id = crypto.randomUUID();
  const inferred = inferRole(input.category, input.name, input.noInsert ?? false);
  return prisma.priceItem.create({
    data: {
      id,
      companyId,
      code: `own:${id}`,
      templateCode: null,
      role: inferred.role,
      appliesTo: inferred.appliesTo ?? [],
      wallKind: inferred.wallKind ?? undefined,
      category: inferred.category,
      needsReview: inferred.needsReview,
      maxWidthCm: inferred.role === "canvas" ? (input.maxWidthCm !== undefined ? input.maxWidthCm : parseRollWidthCm(input.name)) : null,
      name: input.name,
      unit: input.unit,
      price: input.price,
      installerPrice: input.installerPrice ?? null,
      photoUrl: input.photoUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      physicalWidthMm: input.physicalWidthMm ?? null,
      physicalHeightMm: input.physicalHeightMm ?? null,
      colorHex: input.colorHex ?? null,
      mountingType: input.mountingType ?? null,
      glbModelUrl: input.glbModelUrl ?? null,
    },
  });
}

/** Правка своей позиции (бывший PriceVariant.update). Смена категории/имени пересчитывает роль. */
export async function updateOwnItem(existing: PriceItemRow, updates: Partial<OwnItemInput>) {
  const data: Record<string, unknown> = {};
  for (const k of ["name", "unit", "price", "installerPrice", "photoUrl", "sortOrder", "physicalWidthMm", "physicalHeightMm", "colorHex", "mountingType", "glbModelUrl", "maxWidthCm"] as const) {
    if (updates[k] !== undefined) data[k] = updates[k];
  }
  // Полотно переименовали, ширину явно не задали — перечитываем из названия.
  if (existing.role === "canvas" && updates.name !== undefined && updates.maxWidthCm === undefined) {
    const parsed = parseRollWidthCm(updates.name);
    if (parsed !== null) data.maxWidthCm = parsed;
  }
  const wk = (existing.wallKind ?? {}) as WallKind;
  const category = updates.category ?? existing.category ?? "other";
  const name = updates.name ?? existing.name;
  const noInsert = updates.noInsert ?? wk.noInsert ?? false;
  // Бывший CustomItem живёт в category "custom" — на него ссылаются room.customItems веб-калькулятора,
  // роль и категорию не пересчитываем (ревью 01.10.2026).
  if (existing.category !== "custom" && (updates.category !== undefined || updates.name !== undefined || updates.noInsert !== undefined)) {
    const inferred = inferRole(category, name, noInsert);
    data.role = inferred.role;
    data.appliesTo = inferred.appliesTo ?? [];
    data.wallKind = inferred.wallKind ?? null;
    data.category = inferred.category;
    // Мастер сам тронул позицию — вопрос «как считать» закрыт.
    data.needsReview = false;
  }
  return prisma.priceItem.update({ where: { id: existing.id }, data });
}

/** Бывший CustomItem.create: штучная позиция веб-калькулятора со своим кодом. */
export async function createCustomItem(companyId: string, input: { name: string; unit: string; price: number }) {
  const id = crypto.randomUUID();
  return prisma.priceItem.create({
    data: {
      id,
      companyId,
      code: `custom_${id.slice(0, 8)}`,
      templateCode: null,
      role: "extra",
      category: "custom",
      name: input.name,
      unit: input.unit,
      price: input.price,
    },
  });
}

/** Ответ старого /custom-items. */
export function toLegacyCustomItem(r: PriceItemRow, masterId: string) {
  return { id: r.id, masterId, code: r.code, name: r.name, unit: r.unit, price: r.price, category: "custom", createdAt: r.createdAt, updatedAt: r.updatedAt };
}

// ------------------------------------------------------------------
// Форма /prices/v2 («Мой прайс»)
// ------------------------------------------------------------------

export type PriceItemV2 = {
  id: string;
  code: string;
  templateCode: string | null;
  role: PriceRole;
  appliesTo: string[];
  wallKind: Record<string, unknown> | null;
  category: string | null;
  name: string;
  unit: string;
  price: number;
  /** цена каталога, если позиция каталожная */
  defaultPrice: number | null;
  installerPrice: number | null;
  photoUrl: string | null;
  isHidden: boolean;
  needsReview: boolean;
  sortOrder: number;
  isTemplate: boolean;
  /** цена отличается от каталожной */
  isCustom: boolean;
  /** полотно: ширина рулона, см (null — любая ширина) */
  maxWidthCm: number | null;
};

export function toV2(r: PriceItemRow): PriceItemV2 {
  const tpl = r.templateCode ? PRODUCT_BY_CODE[r.templateCode] : undefined;
  return {
    id: r.id,
    code: r.code,
    templateCode: r.templateCode,
    role: r.role as PriceRole,
    appliesTo: r.appliesTo,
    wallKind: (r.wallKind as Record<string, unknown> | null) ?? null,
    category: r.category,
    name: r.name,
    unit: r.unit,
    price: r.price,
    defaultPrice: tpl?.defaultPrice ?? null,
    installerPrice: r.installerPrice ?? null,
    photoUrl: r.photoUrl ?? null,
    isHidden: r.isHidden,
    needsReview: r.needsReview,
    sortOrder: r.sortOrder,
    isTemplate: r.templateCode !== null,
    isCustom: tpl ? r.price !== tpl.defaultPrice : false,
    maxWidthCm: r.maxWidthCm ?? null,
  };
}

