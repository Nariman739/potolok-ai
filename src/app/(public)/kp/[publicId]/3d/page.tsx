import { prisma } from "@/lib/prisma";
import { ownerBrandFor } from "@/lib/company";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { pickKpRoomForScene3D, mapRoomToScene3DProps, matchObjectRoom, kpRoomWithObjectData } from "@/lib/room-3d";
import { asLang, tFor } from "@/lib/i18n";
import "@/lib/i18n/kp-public";
import { DOC_ROBOTS } from "@/lib/doc-og";
import { variantNamesFor } from "@/lib/variant-names";
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
  if (!estimate) return { title: "3D-просмотр не найден", robots: DOC_ROBOTS };
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
      robots: DOC_ROBOTS,
      openGraph: { title, description, images: [{ url: cacheBust }] },
      twitter: { card: "summary_large_image", title, description, images: [cacheBust] },
    };
  }

  return { title, description, robots: DOC_ROBOTS };
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
      createdAt: true,
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
            select: { id: true, name: true, wallProfiles: true, withInsert: true, insertColor: true, wallFurniture: true },
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

  // Комната для 3D: как раньше — с normalCorners; у КП, созданных после выката, — ещё и комната
  // приложения (стены + углы) с замкнутым контуром. Старые КП из приложения — без 3D, как были.
  const picked = pickKpRoomForScene3D(estimate.roomsData, estimate.createdAt);
  if (!picked) {
    // Нет геометрии для 3D — возвращаем клиента к КП
    redirect(`/kp/${publicId}`);
  }
  const { room, fromAngles } = picked;

  // Комната объекта для этой комнаты КП: по serverId → по имени → по номеру (matchObjectRoom).
  // Нужна для «фасада шкафа» (в КП его нет) и как запасной источник профилей и вставки.
  const roomsData = Array.isArray(estimate.roomsData) ? (estimate.roomsData as unknown[]) : [];
  const mRooms = estimate.measurementObject?.rooms ?? [];
  const mRoom = matchObjectRoom(room as { serverId?: unknown; name?: unknown }, roomsData.indexOf(room), roomsData.length, mRooms);

  // Профили, вставка, фасад: снимок КП → wallProfileData → комната объекта (kpRoomWithObjectData).
  const sceneProps = mapRoomToScene3DProps(kpRoomWithObjectData(room, mRoom), { fromAngles });
  if (!sceneProps) redirect(`/kp/${publicId}`);
  // Свои софиты/треки мастера: имена позиций — с сервера, клиенту прайс под логином недоступен.
  const variantNames = await variantNamesFor(sceneProps.elements, { masterId: estimate.masterId, companyId: estimate.companyId });

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
      variantNames={variantNames}
      betaLabel={t("kp.beta3d")}
      fallbackImageUrl={estimate.room3dPreviewUrl}
      backHref={`/kp/${publicId}`}
      backLabel="К КП"
      noGl={{ title: t("kp.no3dTitle"), text: t("kp.no3dTextKp"), button: t("kp.no3dOpenKp"), retry: t("kp.no3dRetry") }}
    />
  );
}
