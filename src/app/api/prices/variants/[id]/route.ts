import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function findOwned(id: string, masterId: string) {
  return prisma.priceVariant.findFirst({ where: { id, masterId, deletedAt: null } });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await ctx.params;
    const existing = await findOwned(id, master.id);
    if (!existing) {
      return NextResponse.json({ error: "Вариант не найден" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";
    const updates: {
      name?: string;
      unit?: string;
      price?: number;
      installerPrice?: number | null;
      sortOrder?: number;
      photoUrl?: string | null;
      category?: string;
      noInsert?: boolean;
      physicalWidthMm?: number | null;
      physicalHeightMm?: number | null;
      colorHex?: string | null;
      mountingType?: string | null;
      glbModelUrl?: string | null;
    } = {};

    const ALLOWED_CATEGORIES_SET = new Set([
      "canvas",
      "profile",
      "spot",
      "chandelier",
      "curtain",
      "gardina",
      "podshtornik",
      "track",
      "lightline",
    ]);

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.has("name")) updates.name = String(form.get("name") || "").trim();
      if (form.has("unit")) updates.unit = String(form.get("unit") || "");
      if (form.has("price")) updates.price = parseFloat(String(form.get("price") || "0"));
      if (form.has("installerPrice")) {
        const raw = String(form.get("installerPrice"));
        updates.installerPrice = raw === "" || raw === "null" ? null : parseFloat(raw);
      }
      if (form.has("sortOrder")) updates.sortOrder = parseInt(String(form.get("sortOrder") || "0"), 10) || 0;
      if (form.has("noInsert")) {
        const v = form.get("noInsert");
        updates.noInsert = v === "1" || v === "true";
      }
      if (form.has("category")) {
        const cat = String(form.get("category") || "");
        if (!ALLOWED_CATEGORIES_SET.has(cat)) {
          return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
        }
        updates.category = cat;
      }

      const file = form.get("photo") as File | null;
      if (file && file.size > 0) {
        if (file.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: "Фото максимум 5MB" }, { status: 400 });
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `price-variants/${master.id}/${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`;
        const ct = file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type || "image/jpeg";
        const blob = await put(path, file, { access: "public", contentType: ct });
        updates.photoUrl = blob.url;
        // удалим старое фото
        if (existing.photoUrl) {
          try { await del(existing.photoUrl); } catch { /* ignore */ }
        }
      } else if (form.get("removePhoto") === "1" && existing.photoUrl) {
        try { await del(existing.photoUrl); } catch { /* ignore */ }
        updates.photoUrl = null;
      }
      if (form.has("physicalWidthMm")) {
        const v = parseInt(String(form.get("physicalWidthMm")), 10);
        updates.physicalWidthMm = Number.isFinite(v) ? v : null;
      }
      if (form.has("physicalHeightMm")) {
        const v = parseInt(String(form.get("physicalHeightMm")), 10);
        updates.physicalHeightMm = Number.isFinite(v) ? v : null;
      }
      if (form.has("colorHex")) updates.colorHex = (form.get("colorHex") as string) || null;
      if (form.has("mountingType")) updates.mountingType = (form.get("mountingType") as string) || null;
      if (form.has("glbModelUrl")) updates.glbModelUrl = (form.get("glbModelUrl") as string) || null;
    } else {
      const body = await request.json();
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.unit !== undefined) updates.unit = String(body.unit);
      if (body.price !== undefined) updates.price = parseFloat(String(body.price));
      if (body.installerPrice !== undefined) {
        updates.installerPrice = body.installerPrice === null ? null : Number(body.installerPrice);
      }
      if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
      if (body.noInsert !== undefined) updates.noInsert = body.noInsert === true || body.noInsert === "true";
      if (body.category !== undefined) {
        const cat = String(body.category);
        if (!ALLOWED_CATEGORIES_SET.has(cat)) {
          return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
        }
        updates.category = cat;
      }
      if (body.physicalWidthMm !== undefined) {
        updates.physicalWidthMm = body.physicalWidthMm === null ? null : Number(body.physicalWidthMm);
      }
      if (body.physicalHeightMm !== undefined) {
        updates.physicalHeightMm = body.physicalHeightMm === null ? null : Number(body.physicalHeightMm);
      }
      if (body.colorHex !== undefined) updates.colorHex = body.colorHex === null ? null : String(body.colorHex);
      if (body.mountingType !== undefined) updates.mountingType = body.mountingType === null ? null : String(body.mountingType);
      if (body.glbModelUrl !== undefined) updates.glbModelUrl = body.glbModelUrl === null ? null : String(body.glbModelUrl);
    }

    if (updates.price !== undefined && (!isFinite(updates.price) || updates.price < 0)) {
      return NextResponse.json({ error: "Неверная цена" }, { status: 400 });
    }

    const variant = await prisma.priceVariant.update({ where: { id }, data: updates });
    return NextResponse.json(variant);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Update variant error:", error);
    return NextResponse.json({ error: "Ошибка обновления варианта" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await ctx.params;
    const existing = await findOwned(id, master.id);
    if (!existing) {
      return NextResponse.json({ error: "Вариант не найден" }, { status: 404 });
    }
    // Soft-delete: фото в Vercel Blob НЕ удаляем — оно нужно при restore.
    // Hard-delete фото уйдёт только если мастер сделает «Удалить навсегда»
    // из /dashboard/trash (см. PR-B).
    await prisma.priceVariant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete variant error:", error);
    return NextResponse.json({ error: "Ошибка удаления варианта" }, { status: 500 });
  }
}
