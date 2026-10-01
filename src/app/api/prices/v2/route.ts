import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { PRODUCT_ITEMS } from "@/lib/constants";
import {
  CATEGORY_ROLES,
  createOwnItem,
  loadPriceItems,
  priceBookCompanyId,
  seedTemplateItems,
  toV2,
  type PriceRole,
} from "@/lib/price-items";

/**
 * «Мой прайс» v2 (01.10.2026) — один массив позиций компании с ролью.
 * Экран прайса в приложении читает только это; старые /prices и /prices/variants
 * остаются для расчёта и старых версий приложения.
 *
 * GET  → { items, isOwner, companyName }
 * POST → создать свою позицию { name, unit, price, role?, appliesTo?, category?, installerPrice? }
 *        role по умолчанию extra («считаю сам»); category — для совместимости с пикерами старого расчёта.
 */

export async function GET() {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const companyId = await priceBookCompanyId(scope.ownerId);
    // Новые каталожные коды (pk14, diffuser…) появляются у компании при первом
    // открытии «Моего прайса» — чтобы у каждой строки был id. В стабильном
    // состоянии записи нет: сидим только если чего-то не хватает.
    let rows = await loadPriceItems(companyId);
    const have = new Set(rows.map((r) => r.code));
    if (PRODUCT_ITEMS.some((tpl) => !have.has(tpl.code))) {
      await seedTemplateItems(companyId);
      rows = await loadPriceItems(companyId);
    }
    // Legacy-коды вне каталога (spot_gu10…) мастеру не показываем — они и раньше были невидимы.
    const items = rows.filter((r) => r.category !== "legacy").map(toV2);
    return NextResponse.json({ items, isOwner: scope.isOwner, companyName: scope.companyName });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get prices v2 error:", error);
    return NextResponse.json({ error: "Ошибка загрузки прайса" }, { status: 500 });
  }
}

const UNITS = ["м²", "м.п.", "шт.", "пара"] as const;
const ROLES: PriceRole[] = ["canvas", "wall", "point", "linear", "extra"];

/** Категория старого расчёта для новой позиции по роли/элементу — чтобы пикеры в КП её увидели. */
function categoryFor(role: PriceRole, appliesTo: string[], explicit?: string): string {
  if (explicit && CATEGORY_ROLES[explicit]) return explicit;
  if (role === "canvas") return "canvas";
  if (role === "wall") return "profile";
  if (role === "point") return appliesTo.includes("chandelier") ? "chandelier" : appliesTo.includes("spot_pair") ? "spot_pair" : "spot";
  if (role === "linear") {
    for (const c of ["track", "lightline", "curtain", "gardina"]) if (appliesTo.includes(c)) return c;
    return "gardina";
  }
  return "other";
}

export async function POST(request: NextRequest) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Позиции в прайс компании добавляет её владелец" }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown; unit?: unknown; price?: unknown; role?: unknown; appliesTo?: unknown; category?: unknown; installerPrice?: unknown; noInsert?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const unit = typeof body.unit === "string" ? body.unit : "шт.";
    const price = Number(body.price);
    const role = (typeof body.role === "string" && (ROLES as string[]).includes(body.role) ? body.role : "extra") as PriceRole;
    const appliesTo = Array.isArray(body.appliesTo) ? body.appliesTo.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
    if (!name) return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    if (!(UNITS as readonly string[]).includes(unit)) return NextResponse.json({ error: "Неверная единица измерения" }, { status: 400 });
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
      return NextResponse.json({ error: "Цена должна быть от 0 до 10 000 000 ₸" }, { status: 400 });
    }
    const installerPrice = body.installerPrice === null || body.installerPrice === undefined ? null : Number(body.installerPrice);

    const companyId = await priceBookCompanyId(scope.ownerId);
    // Дубль по имени — не плодим: возвращаем существующую позицию, экран предложит поменять цену.
    const dup = await prisma.priceItem.findFirst({
      where: { companyId, deletedAt: null, name: { equals: name, mode: "insensitive" } },
    });
    if (dup) return NextResponse.json({ item: toV2(dup), duplicate: true });

    const category = categoryFor(role, appliesTo, typeof body.category === "string" ? body.category : undefined);
    const created = await createOwnItem(companyId, {
      category,
      name,
      unit,
      price,
      installerPrice: installerPrice !== null && Number.isFinite(installerPrice) ? installerPrice : null,
      noInsert: body.noInsert === true,
    });
    // Явно заданная роль/элементы важнее выведенных из категории.
    const item =
      created.role !== role || appliesTo.length > 0
        ? await prisma.priceItem.update({ where: { id: created.id }, data: { role, appliesTo: appliesTo.length ? appliesTo : created.appliesTo, needsReview: false } })
        : created;
    return NextResponse.json({ item: toV2(item), duplicate: false });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create price item error:", error);
    return NextResponse.json({ error: "Не удалось добавить позицию" }, { status: 500 });
  }
}
