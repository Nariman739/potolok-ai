import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { addClientEvent } from "@/lib/clients";
import { stringList } from "@/lib/act-render";
import crypto from "crypto";

/**
 * Создать или дополнить акт приёмки (27.09.2026).
 *
 * Тело: completionDate, remarks (список замечаний мастера), remarksDueDays,
 * objectNotes (особенности помещения), photos (ссылки на фото), sent (true —
 * отметить, что акт отправлен клиенту). Все поля необязательны: акт без
 * замечаний и фото — обычный случай. Подписанный акт не меняется.
 */
type Body = {
  completionDate?: string;
  remarks?: unknown;
  remarksDueDays?: unknown;
  objectNotes?: unknown;
  photos?: unknown;
  sent?: unknown;
};

function cleanRemarks(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  return stringList(raw).map((r) => r.trim().slice(0, 300)).filter(Boolean).slice(0, 10);
}

function cleanPhotos(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  return stringList(raw).filter((u) => /^https:\/\/[^\s"<>]+$/.test(u)).slice(0, 10);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const master = await requireAuth();
    const scope = await getScope(master);
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Body;

    const estimate = await prisma.estimate.findFirst({
      where: { id, ...inScope(scope), deletedAt: null },
      select: { id: true, clientId: true, actPublicId: true, actCreatedAt: true, actSignedAt: true, actSentAt: true },
    });
    if (!estimate) {
      return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    }
    if (estimate.actSignedAt) {
      return NextResponse.json(
        { error: "Акт уже подписан, менять его нельзя", actPublicId: estimate.actPublicId, actSignedAt: estimate.actSignedAt },
        { status: 409 },
      );
    }

    const compDate = body.completionDate ? new Date(body.completionDate) : null;
    const remarks = cleanRemarks(body.remarks);
    const photos = cleanPhotos(body.photos);
    const dueRaw = Number(body.remarksDueDays);
    const remarksDueDays = Number.isFinite(dueRaw) && dueRaw >= 1 && dueRaw <= 60 ? Math.round(dueRaw) : undefined;
    const objectNotes = typeof body.objectNotes === "string" ? body.objectNotes.trim().slice(0, 1000) : undefined;
    const sent = body.sent === true;

    const data = {
      ...(compDate && !Number.isNaN(compDate.getTime()) && { actCompletionDate: compDate }),
      ...(remarks !== undefined && { actRemarks: remarks }),
      ...(photos !== undefined && { actPhotos: photos }),
      ...(remarksDueDays !== undefined && { actRemarksDueDays: remarksDueDays }),
      ...(objectNotes !== undefined && { actObjectNotes: objectNotes || null }),
      ...(sent && !estimate.actSentAt && { actSentAt: new Date() }),
    };

    if (estimate.actPublicId) {
      if (Object.keys(data).length > 0) {
        await prisma.estimate.update({ where: { id }, data });
      }
      return NextResponse.json({
        actPublicId: estimate.actPublicId,
        actCreatedAt: estimate.actCreatedAt,
        actSignedAt: null,
        url: `https://potolok.ai/act/${estimate.actPublicId}`,
      });
    }

    const actPublicId = crypto.randomUUID();
    const now = new Date();
    await prisma.estimate.update({
      where: { id },
      data: {
        actPublicId,
        actCreatedAt: now,
        actCompletionDate: compDate && !Number.isNaN(compDate.getTime()) ? compDate : now,
        ...data,
      },
    });

    if (estimate.clientId) {
      addClientEvent({
        clientId: estimate.clientId,
        type: "ACT_CREATED",
        content: "Акт приёмки работ создан и готов к отправке",
        metadata: { estimateId: id, actPublicId },
      }).catch(() => {});
    }

    return NextResponse.json({
      actPublicId,
      actCreatedAt: now.toISOString(),
      actSignedAt: null,
      url: `https://potolok.ai/act/${actPublicId}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Create act error:", error);
    return NextResponse.json({ error: "Ошибка создания акта" }, { status: 500 });
  }
}
