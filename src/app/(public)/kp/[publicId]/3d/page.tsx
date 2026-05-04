import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { pickRoomForScene3D, mapRoomToScene3DProps } from "@/lib/room-3d";
import { Public3DViewer } from "./Public3DViewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const estimate = await prisma.estimate.findUnique({
    where: { publicId },
    include: { master: { select: { companyName: true, firstName: true } } },
  });
  if (!estimate) return { title: "3D-просмотр не найден" };

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

  const estimate = await prisma.estimate.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      roomsData: true,
      master: { select: { brandColor: true, companyName: true, firstName: true } },
    },
  });

  if (!estimate) notFound();

  const room = pickRoomForScene3D(estimate.roomsData);
  if (!room) {
    // Нет геометрии для 3D — возвращаем клиента к КП
    redirect(`/kp/${publicId}`);
  }

  const sceneProps = mapRoomToScene3DProps(room);
  if (!sceneProps) redirect(`/kp/${publicId}`);

  const brandColor = estimate.master.brandColor || "#1e3a5f";

  return (
    <Public3DViewer
      publicId={publicId}
      brandColor={brandColor}
      vertices={sceneProps.vertices}
      walls={sceneProps.walls}
      ceilingHeight={sceneProps.ceilingHeight}
      elements={sceneProps.elements}
    />
  );
}
