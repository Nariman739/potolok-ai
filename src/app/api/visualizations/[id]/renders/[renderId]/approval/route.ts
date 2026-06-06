// PATCH /api/visualizations/[id]/renders/[renderId]/approval
// Мастер меняет approvalStatus рендера: PENDING_REVIEW → APPROVED | ARCHIVED.
// Только APPROVED рендеры попадают на public /visual/[hash] и в КП-галерею.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = new Set(["PENDING_REVIEW", "APPROVED", "ARCHIVED"]);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; renderId: string }> },
) {
  const master = await requireAuth();
  const { id: visualizationId, renderId } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: "status: PENDING_REVIEW | APPROVED | ARCHIVED" },
      { status: 400 },
    );
  }

  const viz = await prisma.visualization.findUnique({
    where: { id: visualizationId },
    select: { id: true, masterId: true },
  });
  if (!viz || viz.masterId !== master.id) {
    return NextResponse.json({ error: "Visualization not found" }, { status: 404 });
  }

  const render = await prisma.visualizationRender.findUnique({
    where: { id: renderId },
    select: { id: true, visualizationId: true },
  });
  if (!render || render.visualizationId !== visualizationId) {
    return NextResponse.json({ error: "Render not found" }, { status: 404 });
  }

  const updated = await prisma.visualizationRender.update({
    where: { id: renderId },
    data: {
      approvalStatus: body.status as "PENDING_REVIEW" | "APPROVED" | "ARCHIVED",
      approvedAt: body.status === "APPROVED" ? new Date() : null,
    },
    select: { id: true, approvalStatus: true, approvedAt: true },
  });

  return NextResponse.json(updated);
}
