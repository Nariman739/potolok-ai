import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function findOwned(id: string, masterId: string) {
  return prisma.priceVariant.findFirst({ where: { id, masterId } });
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
      sortOrder?: number;
      photoUrl?: string | null;
    } = {};

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.has("name")) updates.name = String(form.get("name") || "").trim();
      if (form.has("unit")) updates.unit = String(form.get("unit") || "");
      if (form.has("price")) updates.price = parseFloat(String(form.get("price") || "0"));
      if (form.has("sortOrder")) updates.sortOrder = parseInt(String(form.get("sortOrder") || "0"), 10) || 0;

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
    } else {
      const body = await request.json();
      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.unit !== undefined) updates.unit = String(body.unit);
      if (body.price !== undefined) updates.price = parseFloat(String(body.price));
      if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
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
    if (existing.photoUrl) {
      try { await del(existing.photoUrl); } catch { /* ignore */ }
    }
    await prisma.priceVariant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete variant error:", error);
    return NextResponse.json({ error: "Ошибка удаления варианта" }, { status: 500 });
  }
}
