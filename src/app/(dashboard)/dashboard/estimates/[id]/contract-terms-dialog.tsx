"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Wallet, Trash2, Plus } from "lucide-react";

export type PaymentStage = {
  name: string;
  percent: number;
  when: string;
};

export type ContractTermsPayload = {
  workStartDate: string; // ISO
  workDurationDays: number;
  paymentSchedule: PaymentStage[];
};

const WHEN_OPTIONS: { key: string; label: string }[] = [
  { key: "before_start", label: "До начала работ" },
  { key: "on_start_day", label: "В день начала" },
  { key: "on_delivery", label: "При поставке материалов" },
  { key: "after_install", label: "После завершения монтажа" },
  { key: "after_act", label: "После подписания Акта" },
];

const PRESETS: {
  key: string;
  label: string;
  description: string;
  stages: PaymentStage[];
}[] = [
  {
    key: "50_50",
    label: "50 / 50",
    description: "Стандарт: половина до, половина после",
    stages: [
      { name: "Предоплата", percent: 50, when: "before_start" },
      { name: "Окончательный расчёт", percent: 50, when: "after_act" },
    ],
  },
  {
    key: "70_30",
    label: "70 / 30",
    description: "Большая предоплата + остаток после",
    stages: [
      { name: "Предоплата", percent: 70, when: "before_start" },
      { name: "Окончательный расчёт", percent: 30, when: "after_act" },
    ],
  },
  {
    key: "30_40_30",
    label: "30 / 40 / 30",
    description: "Три этапа",
    stages: [
      { name: "Аванс", percent: 30, when: "before_start" },
      { name: "При поставке", percent: 40, when: "on_delivery" },
      { name: "Окончательный расчёт", percent: 30, when: "after_act" },
    ],
  },
  {
    key: "after_act",
    label: "100% по факту",
    description: "Без предоплаты",
    stages: [
      { name: "Оплата по факту", percent: 100, when: "after_act" },
    ],
  },
  {
    key: "prepay_full",
    label: "100% предоплата",
    description: "Всё вперёд",
    stages: [
      { name: "Полная предоплата", percent: 100, when: "before_start" },
    ],
  },
];

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ContractTermsDialog({
  open,
  onOpenChange,
  onConfirm,
  saving,
  defaultPrepaymentPercent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (payload: ContractTermsPayload) => void;
  saving: boolean;
  defaultPrepaymentPercent: number;
}) {
  // Подбираем дефолтный пресет по prepaymentPercent профиля
  const initialPreset = useMemo(() => {
    if (defaultPrepaymentPercent === 0) return "after_act";
    if (defaultPrepaymentPercent === 70) return "70_30";
    if (defaultPrepaymentPercent === 100) return "prepay_full";
    return "50_50";
  }, [defaultPrepaymentPercent]);

  const [preset, setPreset] = useState<string>(initialPreset);
  const [stages, setStages] = useState<PaymentStage[]>(() => {
    const found = PRESETS.find((p) => p.key === initialPreset);
    return found ? [...found.stages] : PRESETS[0].stages;
  });
  const [startDate, setStartDate] = useState<string>(todayPlusDays(3));
  const [duration, setDuration] = useState<number>(5);

  const totalPercent = stages.reduce((s, x) => s + (Number(x.percent) || 0), 0);
  const valid = Math.round(totalPercent) === 100 && stages.length > 0;

  function applyPreset(key: string) {
    setPreset(key);
    if (key === "custom") return;
    const found = PRESETS.find((p) => p.key === key);
    if (found) setStages(found.stages.map((s) => ({ ...s })));
  }

  function updateStage(idx: number, patch: Partial<PaymentStage>) {
    setStages((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
    setPreset("custom");
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      { name: "Этап", percent: 0, when: "after_act" },
    ]);
    setPreset("custom");
  }

  function removeStage(idx: number) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
    setPreset("custom");
  }

  function submit() {
    if (!valid) return;
    onConfirm({
      workStartDate: new Date(startDate).toISOString(),
      workDurationDays: duration,
      paymentSchedule: stages,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Условия договора</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Сроки */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#1e3a5f]" />
              Сроки выполнения
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="start-date">Дата начала работ</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="duration">Срок (рабочих дней)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={1}
                  max={365}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 1)}
                />
              </div>
            </div>
          </div>

          {/* Схема оплаты */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#1e3a5f]" />
              Схема оплаты
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  className={
                    "rounded-md border px-2 py-2 text-xs text-left transition-colors " +
                    (preset === p.key
                      ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                      : "border-border bg-white hover:border-[#1e3a5f]/40")
                  }
                >
                  <div className="font-semibold">{p.label}</div>
                  <div
                    className={
                      "text-[10px] " +
                      (preset === p.key ? "text-white/80" : "text-muted-foreground")
                    }
                  >
                    {p.description}
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={
                  "rounded-md border px-2 py-2 text-xs text-left transition-colors " +
                  (preset === "custom"
                    ? "border-[#1e3a5f] bg-[#1e3a5f] text-white"
                    : "border-border bg-white hover:border-[#1e3a5f]/40")
                }
              >
                <div className="font-semibold">Кастом</div>
                <div
                  className={
                    "text-[10px] " +
                    (preset === "custom" ? "text-white/80" : "text-muted-foreground")
                  }
                >
                  Свои этапы
                </div>
              </button>
            </div>

            <div className="space-y-2">
              {stages.map((s, idx) => (
                <div
                  key={idx}
                  className="rounded-md border bg-muted/20 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={s.name}
                      onChange={(e) =>
                        updateStage(idx, { name: e.target.value })
                      }
                      placeholder="Название этапа"
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={s.percent}
                        onChange={(e) =>
                          updateStage(idx, {
                            percent: Math.max(
                              0,
                              Math.min(100, Number(e.target.value) || 0),
                            ),
                          })
                        }
                        className="w-16"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    {stages.length > 1 && (
                      <button
                        onClick={() => removeStage(idx)}
                        className="text-muted-foreground hover:text-red-600"
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div>
                    <Label className="text-[11px]">Когда платить</Label>
                    <select
                      value={s.when}
                      onChange={(e) =>
                        updateStage(idx, { when: e.target.value })
                      }
                      className="w-full rounded-md border bg-white px-2 py-1.5 text-sm"
                    >
                      {WHEN_OPTIONS.map((w) => (
                        <option key={w.key} value={w.key}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {preset === "custom" && stages.length < 5 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addStage}
                  className="w-full"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Добавить этап
                </Button>
              )}
            </div>

            <div
              className={
                "text-xs px-3 py-1.5 rounded-md " +
                (valid
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700")
              }
            >
              Сумма этапов: {totalPercent}% {valid ? "✓" : "(должно быть 100%)"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={submit}
            disabled={!valid || saving}
            className="bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {saving ? "Создаю…" : "Создать договор"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
