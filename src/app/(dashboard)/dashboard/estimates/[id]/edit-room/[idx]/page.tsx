import { getCurrentMaster } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstimateRoomEditor } from "./editor";
import type { RoomInput } from "@/lib/types";
import type { RoomElement } from "@/app/(dashboard)/dashboard/vision-test/room-designer";

export default async function EditRoomPage({
  params,
}: {
  params: Promise<{ id: string; idx: string }>;
}) {
  const master = await getCurrentMaster();
  if (!master) redirect("/api/auth/clear");

  const { id, idx: idxStr } = await params;
  const idx = Number(idxStr);
  if (!Number.isFinite(idx) || idx < 0) notFound();

  const estimate = await prisma.estimate.findFirst({
    where: { id, masterId: master.id },
  });
  if (!estimate) notFound();

  const roomsData = (estimate.roomsData as unknown as RoomInput[]) ?? [];
  const room = roomsData[idx];
  if (!room) notFound();

  const designer = room.designerData;
  if (!designer || !Array.isArray(designer.walls) || designer.walls.length < 3) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dashboard/estimates/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">{room.name}</h1>
        </div>
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
          У этой комнаты нет данных чертежа — она была создана старым способом
          (через калькулятор без замера). Откройте «Пересчитать», чтобы
          отредактировать через калькулятор.
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/calculator?from=${estimate.id}`}>
            Перейти в калькулятор
          </Link>
        </Button>
      </div>
    );
  }

  const designerRoom = {
    id: room.id,
    name: room.name,
    walls: designer.walls,
    normalCorners: (designer.normalCorners ?? []) as boolean[],
    angles: designer.angles,
    cornerRadii: room.designerData?.arcBulges ? undefined : undefined,
    area: designer.area ?? 0,
    perimeter: designer.perimeter ?? 0,
    elements: (designer.elements as RoomElement[] | undefined) ?? [],
    previewUrl3d: room.previewUrl3d,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/estimates/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">
            Чертёж: {room.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            После сохранения КП будет пересчитан автоматически
          </p>
        </div>
      </div>
      <EstimateRoomEditor estimateId={id} idx={idx} room={designerRoom} />
    </div>
  );
}
