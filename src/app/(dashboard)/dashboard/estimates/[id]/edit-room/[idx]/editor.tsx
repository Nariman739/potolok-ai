"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import RoomDesigner from "@/app/(dashboard)/dashboard/vision-test/room-designer";
import type { RoomElement } from "@/app/(dashboard)/dashboard/vision-test/room-designer";

interface RoomDesignerInput {
  id: string;
  name: string;
  walls: number[];
  normalCorners: boolean[];
  angles?: number[];
  cornerRadii?: number[];
  area: number;
  perimeter: number;
  elements?: RoomElement[];
  previewUrl3d?: string;
}

interface EditorProps {
  estimateId: string;
  idx: number;
  room: RoomDesignerInput;
}

export function EstimateRoomEditor({ estimateId, idx, room }: EditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleDone(
    elements: RoomElement[],
    updates?: { walls: number[]; area: number; perimeter: number; name?: string; normalCorners?: boolean[]; angles?: number[] }
  ) {
    setSaving(true);
    const walls = updates?.walls ?? room.walls;
    const area = updates?.area ?? room.area;
    const perimeter = updates?.perimeter ?? room.perimeter;
    const name = updates?.name ?? room.name;
    // 2026-06-22 (фикс рассинхрона walls/angles): теперь RoomDesigner держит
    // нормальные nC/angles в локальном state и сам передаёт их синхронно с
    // walls (когда удаляет выступ — удаляет правильный индекс из всех трёх).
    // Раньше тут был slice(0, walls.length) от старого room.normalCorners —
    // это отрезало от КОНЦА, а не от удалённого индекса, и теряло -90 углов
    // в средних позициях. Если updates с normalCorners/angles пришли —
    // используем их как есть. Иначе оставляем старую защитную логику.
    const normalCorners = updates?.normalCorners
      ? updates.normalCorners
      : walls.length === room.normalCorners.length
        ? room.normalCorners
        : room.normalCorners.slice(0, walls.length);
    const angles = updates?.angles
      ? updates.angles
      : !room.angles || room.angles.length === walls.length
        ? room.angles
        : room.angles.slice(0, walls.length);
    const res = await fetch(
      `/api/estimates/${estimateId}/recalc-room/${idx}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designer: {
            walls,
            normalCorners,
            angles,
            cornerRadii: room.cornerRadii,
            area,
            perimeter,
            elements,
            previewUrl3d: room.previewUrl3d,
            name,
          },
        }),
      }
    );
    setSaving(false);
    if (!res.ok) {
      toast.error("Не удалось сохранить чертёж");
      return;
    }
    toast.success("Чертёж сохранён, КП пересчитан");
    router.push(`/dashboard/estimates/${estimateId}`);
    router.refresh();
  }

  return (
    <RoomDesigner
      room={room}
      onDone={handleDone}
      onCancel={() =>
        router.push(`/dashboard/estimates/${estimateId}`)
      }
    />
  );
}
