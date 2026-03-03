"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomForm } from "@/components/calculator/room-form";
import { RoomCard } from "@/components/calculator/room-card";
import { CalculationResults } from "@/components/calculator/calculation-results";
import { SaveDialog } from "@/components/calculator/save-dialog";
import { useCalculator } from "@/hooks/use-calculator";
import { computeArea } from "@/lib/room-geometry";
import { Plus, Calculator, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { RoomInput } from "@/lib/types";

export default function CalculatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CalculatorContent />
    </Suspense>
  );
}

function CalculatorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    rooms,
    result,
    isCalculating,
    error,
    addRoom,
    updateRoom,
    removeRoom,
    duplicateRoom,
    calculate,
    reset,
    loadRooms,
  } = useCalculator();

  const [showForm, setShowForm] = useState(rooms.length === 0);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [loadingFrom, setLoadingFrom] = useState(false);
  const loadedRef = useRef(false);

  // Load rooms from existing estimate (?from=estimateId)
  useEffect(() => {
    const fromId = searchParams.get("from");
    if (!fromId || loadedRef.current) return;
    loadedRef.current = true;
    setLoadingFrom(true);
    fetch(`/api/estimates/${fromId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((est) => {
        if (!est) return;
        const importedRooms: RoomInput[] = est.roomsData ?? est.calculationData?.rooms ?? [];
        if (importedRooms.length > 0) {
          loadRooms(importedRooms);
          setShowForm(false);
          toast.success(`Загружено ${importedRooms.length} комнат — редактируйте и пересчитайте`);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFrom(false));
  }, [searchParams, loadRooms]);

  useEffect(() => {
    fetch("/api/prices")
      .then((r) => r.json())
      .then((items: { code: string; price: number }[]) => {
        const map: Record<string, number> = {};
        for (const item of items) map[item.code] = item.price;
        setPriceMap(map);
      })
      .catch(() => {});
  }, []);

  async function handleSave(clientName: string, clientPhone: string) {
    if (!result) return;
    setSaving(true);

    const discountAmount = Math.round(result.total * discountPercent / 100);
    const finalTotal = result.total - discountAmount;

    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomsData: result.rooms,
          calculationData: result,
          totalArea: result.totalArea,
          total: finalTotal,
          discountPercent,
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

  // Loading rooms from existing estimate
  if (loadingFrom) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Загружаем комнаты...</p>
      </div>
    );
  }

  // Show results if we have them
  if (result) {
    return (
      <div className="space-y-6">
        <CalculationResults
          result={result}
          onSave={(dp) => {
            setDiscountPercent(dp);
            setSaveOpen(true);
          }}
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
          Добавьте комнаты и получите стоимость
        </p>
      </div>

      {rooms.length === 0 && !result && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-800">
            Цены по умолчанию уже настроены. Добавьте комнату и нажмите «Рассчитать».
          </p>
        </div>
      )}

      {/* Room list */}
      {rooms.length > 0 && (
        <div className="space-y-3">
          {rooms.map((room, i) => (
            editingRoomId === room.id ? (
              <Card key={room.id}>
                <CardHeader>
                  <CardTitle className="text-lg">Редактирование: {room.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RoomForm
                    editRoom={room}
                    onAdd={(updated) => {
                      updateRoom(room.id, updated);
                      setEditingRoomId(null);
                    }}
                    onCancel={() => setEditingRoomId(null)}
                    priceMap={priceMap}
                  />
                </CardContent>
              </Card>
            ) : (
              <RoomCard
                key={room.id}
                room={room}
                index={i}
                onDuplicate={duplicateRoom}
                onRemove={removeRoom}
                onEdit={(id) => {
                  setEditingRoomId(id);
                  setShowForm(false);
                }}
              />
            )
          ))}
        </div>
      )}

      {/* Room form */}
      {showForm && !editingRoomId ? (
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
              priceMap={priceMap}
            />
          </CardContent>
        </Card>
      ) : !editingRoomId && rooms.length > 0 ? (
        <Button
          variant="outline"
          className="w-full border-dashed h-12"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Добавить комнату
        </Button>
      ) : null}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Calculate button */}
      {rooms.length > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <p className="text-sm text-muted-foreground">
            {rooms.length} комнат | {rooms.reduce((s, r) => s + computeArea(r), 0).toFixed(1)} м²
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
