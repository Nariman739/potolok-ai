import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pickRoomForScene3D, mapRoomToScene3DProps, type SavedRoom3D } from "@/lib/room-3d";
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
        },
      },
      master: { select: { brandColor: true, companyName: true, firstName: true } },
    },
  });
  return obj;
}

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
  }));

  const room = pickRoomForScene3D(roomShapes);
  const sceneProps = room ? mapRoomToScene3DProps(room) : null;
  if (!sceneProps) notFound();

  const brandColor = obj.master.brandColor || "#1e3a5f";
  const fallbackImageUrl = obj.rooms.find((r) => r.previewUrl3d)?.previewUrl3d ?? null;

  return (
    <Public3DViewer
      brandColor={brandColor}
      vertices={sceneProps.vertices}
      walls={sceneProps.walls}
      ceilingHeight={sceneProps.ceilingHeight}
      elements={sceneProps.elements}
      fallbackImageUrl={fallbackImageUrl}
    />
  );
}
