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

  async function handleDone(elements: RoomElement[]) {
    setSaving(true);
    const res = await fetch(
      `/api/estimates/${estimateId}/recalc-room/${idx}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designer: {
            walls: room.walls,
            normalCorners: room.normalCorners,
            angles: room.angles,
            cornerRadii: room.cornerRadii,
            area: room.area,
            perimeter: room.perimeter,
            elements,
            previewUrl3d: room.previewUrl3d,
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
