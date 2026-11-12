import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pickRoomForScene3D, mapRoomToScene3DProps, type SavedRoom3D } from "@/lib/room-3d";
import { asLang, tFor } from "@/lib/i18n";
import "@/lib/i18n/kp-public";
import { Public3DViewer } from "../../kp/[publicId]/3d/Public3DViewer";

// Публичная 3D-ссылка ПРЯМО с замера (/z/[shareId]) — до создания КП.
// Мастер жмёт «Поделиться 3D» в дашборде → сюда попадает клиент без логина.

async function loadShared(shareId: string) {
  const obj = await prisma.measurementObject.findFirst({
    where: { publicShareId: shareId, deletedAt: null },
    select: {
      rooms: {
        orderBy: { sortOrder: "asc" },
        select: {
          walls: true,
          normalCorners: true,
          angles: true,
          elements: true,
          previewUrl3d: true,
          // Паритет с 3D приложения (11.11.2026): профили стен, вставка, фасад шкафа.
          wallProfiles: true,
          withInsert: true,
          insertColor: true,
          wallFurniture: true,
        },
      },
      master: { select: { brandColor: true, companyName: true, firstName: true, language: true } },
    },
  });
  return obj;
}

// Ссылки на эти страницы уходят клиенту в WhatsApp и живут вечно: если такую
// перешлют в общий чат или выложат в отзыв, поисковик проиндексирует имя,
// телефон, адрес заказчика и сумму сделки. Закрываем от индексации
// (аудит 24.09.2026).
export const robots = { index: false, follow: false };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const obj = await loadShared(shareId);
  if (!obj) return { title: "3D-просмотр не найден" };

  const company = obj.master.companyName || obj.master.firstName;
  const title = `3D-просмотр потолка | ${company}`;
  const description = `3D-визуализация натяжного потолка от ${company}`;
  const preview = obj.rooms.find((r) => r.previewUrl3d)?.previewUrl3d;

  if (preview) {
    return {
      title,
      description,
      openGraph: { title, description, images: [{ url: preview }] },
      twitter: { card: "summary_large_image", title, description, images: [preview] },
    };
  }
  return { title, description };
}

export default async function PublicMeasurement3DPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const obj = await loadShared(shareId);
  if (!obj) notFound();

  // MeasurementRoom → форма SavedRoom3D (walls/normalCorners на верхнем уровне).
  const roomShapes: SavedRoom3D[] = obj.rooms.map((r) => ({
    walls: (r.walls as unknown as number[]) ?? [],
    normalCorners: (r.normalCorners as unknown as boolean[]) ?? [],
    angles: (r.angles as unknown as number[] | null) ?? undefined,
    elements: (r.elements as unknown as SavedRoom3D["elements"]) ?? [],
    wallProfiles: (r.wallProfiles as unknown as Record<string, string> | null) ?? undefined,
    withInsert: r.withInsert,
    insertColor: r.insertColor,
    wallFurniture: r.wallFurniture ?? undefined,
  }));

  const room = pickRoomForScene3D(roomShapes);
  const sceneProps = room ? mapRoomToScene3DProps(room) : null;
  if (!sceneProps) notFound();

  const brandColor = obj.master.brandColor || "#1e3a5f";
  const fallbackImageUrl = obj.rooms.find((r) => r.previewUrl3d)?.previewUrl3d ?? null;
  const t = tFor(asLang(obj.master.language));

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
      fallbackImageUrl={fallbackImageUrl}
      noGl={{ title: t("kp.no3dTitle"), text: t("kp.no3dText") }}
    />
  );
}
