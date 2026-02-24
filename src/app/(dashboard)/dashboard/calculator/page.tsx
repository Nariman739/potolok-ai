"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomForm } from "@/components/calculator/room-form";
import { RoomCard } from "@/components/calculator/room-card";
import { CalculationResults } from "@/components/calculator/calculation-results";
import { SaveDialog } from "@/components/calculator/save-dialog";
import { useCalculator } from "@/hooks/use-calculator";
import { Plus, Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CalculatorPage() {
  const router = useRouter();
  const {
    rooms,
    result,
    isCalculating,
    error,
    addRoom,
    removeRoom,
    duplicateRoom,
    calculate,
    reset,
  } = useCalculator();

  const [showForm, setShowForm] = useState(rooms.length === 0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(clientName: string, clientPhone: string) {
    if (!result) return;
    setSaving(true);

    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomsData: result.rooms,
          calculationData: result,
          totalArea: result.totalArea,
          economyTotal: result.variants[0].total,
          standardTotal: result.variants[1].total,
          premiumTotal: result.variants[2].total,
          clientName: clientName || undefined,
          clientPhone: clientPhone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Ошибка сохранения");
        return;
      }

      toast.success("КП сохранено!");
      router.push(`/dashboard/estimates/${data.id}`);
    } catch {
      toast.error("Ошибка соединения");
    } finally {
      setSaving(false);
      setSaveOpen(false);
    }
  }

  // Show results if we have them
  if (result) {
    return (
      <div className="space-y-6">
        <CalculationResults
          result={result}
          onSave={() => setSaveOpen(true)}
          onReset={reset}
        />
        <SaveDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSave={handleSave}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Калькулятор</h1>
        <p className="text-sm text-muted-foreground">
          Добавьте комнаты и получите 3 варианта стоимости
        </p>
      </div>

      {/* Room list */}
      {rooms.length > 0 && (
        <div className="space-y-3">
          {rooms.map((room, i) => (
            <RoomCard
              key={room.id}
              room={room}
              index={i}
              onDuplicate={duplicateRoom}
              onRemove={removeRoom}
            />
          ))}
        </div>
      )}

      {/* Room form */}
      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {rooms.length === 0 ? "Добавьте комнату" : "Новая комната"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RoomForm
              onAdd={(room) => {
                addRoom(room);
                setShowForm(false);
              }}
              onCancel={rooms.length > 0 ? () => setShowForm(false) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          className="w-full border-dashed h-12"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Добавить комнату
        </Button>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Calculate button */}
      {rooms.length > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-sm text-muted-foreground">
            {rooms.length} комнат | {rooms.reduce((s, r) => s + r.length * r.width, 0).toFixed(1)} м²
          </p>
          <Button
            size="lg"
            onClick={calculate}
            disabled={isCalculating}
            className="bg-[#1e3a5f] hover:bg-[#152d4a] w-full md:w-auto md:min-w-[200px]"
          >
            {isCalculating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Расчёт...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Рассчитать
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
