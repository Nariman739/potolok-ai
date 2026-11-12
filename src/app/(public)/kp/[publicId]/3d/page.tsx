import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { pickRoomForScene3D, mapRoomToScene3DProps, type SavedRoom3D } from "@/lib/room-3d";
import { asLang, tFor } from "@/lib/i18n";
import "@/lib/i18n/kp-public";
import { Public3DViewer } from "./Public3DViewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const estimate = await prisma.estimate.findFirst({
    where: { publicId, deletedAt: null },
    include: { master: { select: { companyName: true, firstName: true } } },
  });
  if (!estimate) return { title: "3D-просмотр не найден" };
  // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
  estimate.master = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);

  const company = estimate.master.companyName || estimate.master.firstName;
  const title = `3D-просмотр потолка | ${company}`;
  const description = `3D-визуализация натяжного потолка от ${company}`;

  if (estimate.room3dPreviewUrl) {
    const cacheBust = `${estimate.room3dPreviewUrl}?v=${estimate.updatedAt.getTime()}`;
    return {
      title,
      description,
      openGraph: { title, description, images: [{ url: cacheBust }] },
      twitter: { card: "summary_large_image", title, description, images: [cacheBust] },
    };
  }

  return { title, description };
}

export default async function Public3DPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const estimate = await prisma.estimate.findFirst({
    where: { publicId, deletedAt: null },
    select: {
      id: true,
      publicId: true,
      masterId: true,
      roomsData: true,
      room3dPreviewUrl: true,
      priceView: true,
      companyId: true,
      master: { select: { brandColor: true, companyName: true, firstName: true, language: true } },
      // «Фасад шкафа» живёт только в комнате замера (MeasurementRoom.wallFurniture), в
      // RoomInput его нет — берём из объекта, по которому сделано КП (паритет с 3D, 11.11.2026).
      measurementObject: {
        select: {
          rooms: {
            orderBy: { sortOrder: "asc" },
            select: { name: true, wallProfiles: true, withInsert: true, insertColor: true, wallFurniture: true },
          },
        },
      },
    },
  });

  if (!estimate) notFound();
  // Кратко (16.10.2026): 3D клиенту не отдаём — в данные страницы ушли бы точные
  // длины стен, и конкурент посчитал бы по ним без замера.
  if (estimate.priceView === "summary") redirect(`/kp/${publicId}`);
  // Бренд/реквизиты — владельца компании, если КП делал участник бригады (Этап 3)
  estimate.master = await ownerBrandFor(estimate.masterId, estimate.master, estimate.companyId);

  const room = pickRoomForScene3D(estimate.roomsData);
  if (!room) {
    // Нет геометрии для 3D — возвращаем клиента к КП
    redirect(`/kp/${publicId}`);
  }

  // Комната замера для этой комнаты КП: сначала по имени, затем по позиции в списке —
  // и только если списков комнат одинаковой длины (0e, 11.11.2026: у 26 из 688 КП число
  // комнат в roomsData ≠ числу комнат объекта — по индексу взялись бы профили чужой
  // комнаты). Не нашли — сцена без профилей/вставки/фасада, как раньше.
  const roomsData = Array.isArray(estimate.roomsData) ? (estimate.roomsData as unknown[]) : [];
  const idx = roomsData.indexOf(room);
  const mRooms = estimate.measurementObject?.rooms ?? [];
  const roomName = typeof room.name === "string" ? room.name.trim() : "";
  const byName = roomName ? mRooms.filter((r) => (r.name ?? "").trim() === roomName) : [];
  const mRoom =
    byName.length === 1 ? byName[0] : mRooms.length === roomsData.length && idx >= 0 ? mRooms[idx] : undefined;

  const sceneProps = mapRoomToScene3DProps({
    ...room,
    wallProfiles: room.wallProfileData?.wallProfiles ?? (mRoom?.wallProfiles as Record<string, string> | null | undefined) ?? undefined,
    withInsert: typeof room.withInsert === "boolean" ? room.withInsert : mRoom?.withInsert,
    insertColor: room.insertColor ?? mRoom?.insertColor,
    wallFurniture: mRoom?.wallFurniture ?? undefined,
  } as SavedRoom3D);
  if (!sceneProps) redirect(`/kp/${publicId}`);

  const brandColor = estimate.master.brandColor || "#1e3a5f";
  const t = tFor(asLang(estimate.master.language));

  return (
    <Public3DViewer
      brandColor={brandColor}
      vertices={sceneProps.vertices}
      walls={sceneProps.walls}
      ceilingHeight={sceneProps.ceilingHeight}
      elements={sceneProps.elements}
      wallProfiles={sceneProps.wallProfiles}
      withInsert={sceneProps.withInsert}
      insertColor={sceneProps.insertColor}
      wallFurniture={sceneProps.wallFurniture}
      betaLabel={t("kp.beta3d")}
      fallbackImageUrl={estimate.room3dPreviewUrl}
      backHref={`/kp/${publicId}`}
      backLabel="К КП"
      noGl={{ title: t("kp.no3dTitle"), text: t("kp.no3dTextKp"), button: t("kp.no3dOpenKp"), retry: t("kp.no3dRetry") }}
    />
  );
}
