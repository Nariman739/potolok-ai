// PATCH  /api/ceiling-elements/[id]  — обновить элемент (имя / категория / defaultQty / isHidden / sortOrder)
// DELETE /api/ceiling-elements/[id]  — удалить элемент (cascade удалит ссылки из VisualizationElement)

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_CATEGORIES = new Set([
  "spot",
  "track",
  "lightline",
  "chandelier",
  "ventilation",
  "decoration",
  "profile",
  "other",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const body = (await request.json()) as {
      name?: string;
      category?: string;
      defaultQty?: number;
      isHidden?: boolean;
      sortOrder?: number;
      description?: string;
    };

    const updateData: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim();
    if (typeof body.category === "string" && VALID_CATEGORIES.has(body.category)) {
      updateData.category = body.category;
    }
    if (typeof body.defaultQty === "number") {
      updateData.defaultQty = Math.max(1, Math.min(99, body.defaultQty));
    }
    if (typeof body.isHidden === "boolean") updateData.isHidden = body.isHidden;
    if (typeof body.sortOrder === "number") updateData.sortOrder = body.sortOrder;
    if (typeof body.description === "string") updateData.description = body.description;

    const result = await prisma.ceilingElement.updateMany({
      where: { id, masterId: master.id },
      data: updateData,
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const fresh = await prisma.ceilingElement.findUnique({ where: { id } });
    return NextResponse.json({ element: fresh });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[ceiling-element PATCH]", error);
    return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;

    const result = await prisma.ceilingElement.deleteMany({
      where: { id, masterId: master.id },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("[ceiling-element DELETE]", error);
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
