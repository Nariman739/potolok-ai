"use client";

import { toast } from "sonner";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_ESTIMATE_RECALC_MESSAGE } from "@/lib/room-edit";

/** «Пересчитать» у КП из приложения: только объясняет, ничего не считает и не создаёт. */
export function AppRecalcButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => toast.info(APP_ESTIMATE_RECALC_MESSAGE)}>
      <RefreshCcw className="h-4 w-4 mr-2" />
      Пересчитать
    </Button>
  );
}
