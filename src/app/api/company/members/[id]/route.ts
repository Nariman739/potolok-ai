import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, normalizePhone } from "@/lib/company";

/** PATCH { name?, phone?, defaultFee? } · DELETE — убрать из компании (мягко). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const member = await prisma.member.findFirst({ where: { id, companyId: scope.companyId, removedAt: null } });
    if (!member) return NextResponse.json({ error: "Не найден" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { name?: unknown; phone?: unknown; defaultFee?: unknown };
    const data: { name?: string; phone?: string | null; defaultFee?: number | null } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
    if (body.phone !== undefined) data.phone = normalizePhone(typeof body.phone === "string" ? body.phone : null);
    if (body.defaultFee === null) data.defaultFee = null;
    else if (typeof body.defaultFee === "number" && body.defaultFee >= 0) data.defaultFee = Math.round(body.defaultFee);

    const updated = await prisma.member.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Patch member error:", error);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const member = await prisma.member.findFirst({ where: { id, companyId: scope.companyId, removedAt: null } });
    if (!member) return NextResponse.json({ error: "Не найден" }, { status: 404 });
    if (member.role === "owner") {
      return NextResponse.json({ error: "Владельца компании убрать нельзя" }, { status: 400 });
    }
    await prisma.member.update({ where: { id }, data: { removedAt: new Date() } });
    // Если у человека это была активная компания — возвращаем его в свою.
    if (member.masterId) {
      await prisma.master.updateMany({
        where: { id: member.masterId, activeCompanyId: scope.companyId },
        data: { activeCompanyId: null },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Delete member error:", error);
    return NextResponse.json({ error: "Не удалось убрать" }, { status: 500 });
  }
}
