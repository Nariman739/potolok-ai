import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { getScope } from "@/lib/company";
import {
  VARIANT_CATEGORIES,
  createOwnItem,
  legacyVariantsView,
  loadPriceItems,
  priceBookCompanyId,
  toLegacyVariant,
} from "@/lib/price-items";

// «Свои варианты» — с 01.10.2026 это свои позиции PriceItem («Мой прайс»),
// ответ в старой форме PriceVariant. Категории открыты все, включая «Прочее»:
// раньше под «Прочее»/«Углы» сервер отвечал 400, и мастера клали диффузор в «Люстры».

const ALLOWED_UNITS = ["м²", "м.п.", "шт.", "пара", "₸"] as const;

function isCategory(v: string): boolean {
  return VARIANT_CATEGORIES.includes(v);
}

function isUnit(v: string): boolean {
  return (ALLOWED_UNITS as readonly string[]).includes(v);
}

export async function GET(request: NextRequest) {
  try {
    const master = await requireAuth();
    // Прайс общий на компанию — читаем и пишем у владельца (Этап 3).
    const scope = await getScope(master);
    const category = request.nextUrl.searchParams.get("category");
    const companyId = await priceBookCompanyId(scope.ownerId);
    const rows = await loadPriceItems(companyId);
    return NextResponse.json(legacyVariantsView(rows, scope.ownerId, category && isCategory(category) ? category : null));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Get variants error:", error);
    return NextResponse.json({ error: "Ошибка получения вариантов" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Позиции в прайс компании добавляет её владелец" }, { status: 403 });
    }
    const contentType = request.headers.get("content-type") || "";

    let category: string;
    let name: string;
    let unit: string;
    let price: number;
    let installerPrice: number | null = null;
    let photoUrl: string | null = null;
    let sortOrder = 0;
    let noInsert = false;
    // 3D-spec поля (опц.)
    let physicalWidthMm: number | null = null;
    let physicalHeightMm: number | null = null;
    let colorHex: string | null = null;
    let mountingType: string | null = null;
    let glbModelUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      // С фото — multipart
      const form = await request.formData();
      category = String(form.get("category") || "");
      name = String(form.get("name") || "").trim();
      unit = String(form.get("unit") || "");
      price = parseFloat(String(form.get("price") || "0"));
      if (form.has("installerPrice")) {
        const raw = String(form.get("installerPrice"));
        installerPrice = raw === "" || raw === "null" ? null : parseFloat(raw);
      }
      sortOrder = parseInt(String(form.get("sortOrder") || "0"), 10) || 0;
      noInsert = form.get("noInsert") === "1" || form.get("noInsert") === "true";
      if (form.has("physicalWidthMm")) {
        const v = parseInt(String(form.get("physicalWidthMm")), 10);
        physicalWidthMm = Number.isFinite(v) ? v : null;
      }
      if (form.has("physicalHeightMm")) {
        const v = parseInt(String(form.get("physicalHeightMm")), 10);
        physicalHeightMm = Number.isFinite(v) ? v : null;
      }
      colorHex = (form.get("colorHex") as string) || null;
      mountingType = (form.get("mountingType") as string) || null;
      glbModelUrl = (form.get("glbModelUrl") as string) || null;

      const file = form.get("photo") as File | null;
      if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: "Фото максимум 5MB" }, { status: 400 });
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `price-variants/${master.id}/${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`;
        const ct = file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type || "image/jpeg";
        const blob = await put(path, file, { access: "public", contentType: ct, addRandomSuffix: true });
        photoUrl = blob.url;
      }
    } else {
      // Без фото — JSON
      const body = await request.json();
      category = String(body.category || "");
      name = String(body.name || "").trim();
      unit = String(body.unit || "");
      price = parseFloat(String(body.price || 0));
      if (body.installerPrice !== undefined) {
        installerPrice = body.installerPrice === null ? null : Number(body.installerPrice);
      }
      sortOrder = body.sortOrder ?? 0;
      noInsert = body.noInsert === true || body.noInsert === "true";
      physicalWidthMm = typeof body.physicalWidthMm === "number" ? body.physicalWidthMm : null;
      physicalHeightMm = typeof body.physicalHeightMm === "number" ? body.physicalHeightMm : null;
      colorHex = typeof body.colorHex === "string" ? body.colorHex : null;
      mountingType = typeof body.mountingType === "string" ? body.mountingType : null;
      glbModelUrl = typeof body.glbModelUrl === "string" ? body.glbModelUrl : null;
    }

    if (!isCategory(category)) {
      return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }
    if (!isUnit(unit)) {
      return NextResponse.json({ error: "Неверная единица измерения" }, { status: 400 });
    }
    if (!isFinite(price) || price < 0 || price > 10_000_000) {
      return NextResponse.json({ error: "Цена должна быть от 0 до 10 000 000" }, { status: 400 });
    }

    const companyId = await priceBookCompanyId(scope.ownerId);
    const item = await createOwnItem(companyId, {
      category,
      name,
      unit,
      price,
      installerPrice: installerPrice === null || Number.isNaN(installerPrice) ? null : installerPrice,
      photoUrl,
      sortOrder,
      noInsert,
      physicalWidthMm,
      physicalHeightMm,
      colorHex,
      mountingType,
      glbModelUrl,
    });

    return NextResponse.json(toLegacyVariant(item, scope.ownerId));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create variant error:", error);
    return NextResponse.json({ error: "Ошибка создания варианта" }, { status: 500 });
  }
}
