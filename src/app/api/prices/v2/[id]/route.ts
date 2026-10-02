import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope } from "@/lib/company";
import { priceBookCompanyId, updateOwnItem, isOwnVariant, toV2 } from "@/lib/price-items";

/**
 * Правка одной позиции «Моего прайса» (каталожной или своей) и удаление своей.
 * PATCH — JSON { price?, installerPrice?, isHidden?, name?, unit?, sortOrder?, needsReview? }
 *         или multipart с photo / removePhoto.
 * DELETE — своя позиция в корзину; каталожную не удалить (только скрыть).
 */

async function owned(id: string, companyId: string) {
  return prisma.priceItem.findFirst({ where: { id, companyId, deletedAt: null } });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Прайс компании меняет её владелец" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const companyId = await priceBookCompanyId(scope.ownerId);
    const existing = await owned(id, companyId);
    if (!existing) return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });

    const contentType = request.headers.get("content-type") || "";
    const data: Record<string, unknown> = {};
    let name: string | undefined;
    let unit: string | undefined;
    let noInsert: boolean | undefined;
    let maxWidthCm: number | null | undefined;

    const take = (k: string, v: unknown) => {
      if (k === "price") {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new RangeError("Цена должна быть от 0 до 10 000 000 ₸");
        data.price = n;
      } else if (k === "installerPrice") {
        data.installerPrice = v === null || v === "" || v === "null" ? null : Number(v);
      } else if (k === "isHidden") data.isHidden = v === true || v === "true";
      else if (k === "needsReview") data.needsReview = v === true || v === "true";
      else if (k === "sortOrder") data.sortOrder = Number(v) || 0;
      else if (k === "name") name = String(v).trim().slice(0, 80);
      else if (k === "unit") unit = String(v);
      else if (k === "noInsert") noInsert = v === true || v === "true";
      else if (k === "maxWidthCm") {
        if (v === null || v === "" || v === "null") maxWidthCm = null;
        else { const n = Number(v); if (Number.isFinite(n) && n >= 100 && n <= 600) maxWidthCm = Math.round(n); }
      }
    };

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      for (const k of ["price", "installerPrice", "isHidden", "needsReview", "sortOrder", "name", "unit", "noInsert", "maxWidthCm"]) {
        if (form.has(k)) take(k, form.get(k));
      }
      const file = form.get("photo") as File | null;
      if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Фото максимум 5MB" }, { status: 400 });
        if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) {
          return NextResponse.json({ error: "Фото: JPG, PNG или WebP" }, { status: 400 });
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `price-items/${companyId}/${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`;
        const ct = file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type;
        const blob = await put(path, file, { access: "public", contentType: ct, addRandomSuffix: true });
        data.photoUrl = blob.url;
        if (existing.photoUrl) { try { await del(existing.photoUrl); } catch { /* best effort */ } }
      } else if (form.get("removePhoto") === "true" || form.get("removePhoto") === "1") {
        if (existing.photoUrl) { try { await del(existing.photoUrl); } catch { /* best effort */ } }
        data.photoUrl = null;
      }
    } else {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      for (const k of ["price", "installerPrice", "isHidden", "needsReview", "sortOrder", "name", "unit", "noInsert", "maxWidthCm"]) {
        if (body[k] !== undefined) take(k, body[k]);
      }
      if (body.removePhoto === true) {
        if (existing.photoUrl) { try { await del(existing.photoUrl); } catch { /* best effort */ } }
        data.photoUrl = null;
      }
    }

    if (unit !== undefined && !["м²", "м.п.", "шт.", "пара"].includes(unit)) {
      return NextResponse.json({ error: "Неверная единица измерения" }, { status: 400 });
    }
    if (name !== undefined && !name) return NextResponse.json({ error: "Название обязательно" }, { status: 400 });

    let updated;
    if (isOwnVariant(existing) || existing.category === "custom") {
      // Своя позиция: имя/единица меняются, роль может пересчитаться.
      updated = await updateOwnItem(existing, {
        ...(name !== undefined && { name }),
        ...(unit !== undefined && { unit }),
        ...(noInsert !== undefined && { noInsert }),
        ...(maxWidthCm !== undefined && { maxWidthCm }),
        ...(data.price !== undefined && { price: data.price as number }),
        ...(data.installerPrice !== undefined && { installerPrice: data.installerPrice as number | null }),
        ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl as string | null }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder as number }),
      });
      if (data.isHidden !== undefined || data.needsReview !== undefined) {
        updated = await prisma.priceItem.update({
          where: { id },
          data: { ...(data.isHidden !== undefined && { isHidden: data.isHidden as boolean }), ...(data.needsReview !== undefined && { needsReview: data.needsReview as boolean }) },
        });
      }
    } else {
      // Каталожная: имя и единица фиксированы каталогом — меняем цену, монтажнику, фото, скрытие.
      delete data.name; delete data.unit;
      updated = await prisma.priceItem.update({ where: { id }, data });
    }
    return NextResponse.json({ item: toV2(updated) });
  } catch (error) {
    if (error instanceof RangeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Patch price item error:", error);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}

// apiUpload в приложении умеет только POST/PUT — для multipart с фото PUT = PATCH.
export { PATCH as PUT };

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    if (!scope.isOwner) {
      return NextResponse.json({ error: "Прайс компании меняет её владелец" }, { status: 403 });
    }
    const { id } = await ctx.params;
    const companyId = await priceBookCompanyId(scope.ownerId);
    const existing = await owned(id, companyId);
    if (!existing) return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });
    if (existing.templateCode) {
      return NextResponse.json({ error: "Каталожную позицию нельзя удалить — её можно скрыть" }, { status: 400 });
    }
    // Сколько комнат ссылаются на неё стенами/выбором — приложение предупредит мастера.
    await prisma.priceItem.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete price item error:", error);
    return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
  }
}
