import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScope, inScope } from "@/lib/company";
import { stringList } from "@/lib/act-render";

/**
 * Фото готового потолка к акту (27.09.2026). Лучшее доказательство
 * состояния на дату приёмки — со временем съёмки. До 10 штук, только
 * пока акт не подписан.
 */
const MAX_PHOTOS = 10;

async function loadEstimate(id: string, masterId: string, activeCompanyId: string | null | undefined) {
  const scope = await getScope({ id: masterId, activeCompanyId });
  return prisma.estimate.findFirst({
    where: { id, ...inScope(scope), deletedAt: null },
    select: { id: true, actPhotos: true, actSignedAt: true },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const estimate = await loadEstimate(id, master.id, master.activeCompanyId);
    if (!estimate) return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    if (estimate.actSignedAt) return NextResponse.json({ error: "Акт уже подписан" }, { status: 409 });

    const photos = stringList(estimate.actPhotos);
    if (photos.length >= MAX_PHOTOS) {
      return NextResponse.json({ error: `Максимум ${MAX_PHOTOS} фото` }, { status: 400 });
    }
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Только изображения" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Максимальный размер 10MB" }, { status: 400 });

    const rawExt = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ext = rawExt === "heic" || rawExt === "heif" ? "jpg" : rawExt;
    const contentType = file.type === "image/heic" || file.type === "image/heif" ? "image/jpeg" : file.type || "image/jpeg";
    const blob = await put(`acts/${master.id}/${id}/${Date.now()}.${ext}`, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    const next = [...photos, blob.url];
    await prisma.estimate.update({ where: { id }, data: { actPhotos: next } });
    return NextResponse.json({ url: blob.url, photos: next });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Act photo upload error:", error);
    return NextResponse.json({ error: "Ошибка загрузки фото" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const master = await requireAuth();
    const { id } = await params;
    const { url } = (await request.json().catch(() => ({}))) as { url?: string };
    if (!url) return NextResponse.json({ error: "URL не указан" }, { status: 400 });
    const estimate = await loadEstimate(id, master.id, master.activeCompanyId);
    if (!estimate) return NextResponse.json({ error: "КП не найдено" }, { status: 404 });
    if (estimate.actSignedAt) return NextResponse.json({ error: "Акт уже подписан" }, { status: 409 });
    const next = stringList(estimate.actPhotos).filter((u) => u !== url);
    await prisma.estimate.update({ where: { id }, data: { actPhotos: next } });
    await del(url).catch(() => {});
    return NextResponse.json({ photos: next });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Act photo delete error:", error);
    return NextResponse.json({ error: "Ошибка удаления фото" }, { status: 500 });
  }
}
