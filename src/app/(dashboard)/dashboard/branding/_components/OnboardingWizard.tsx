"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { OnboardingResult } from "@/lib/kp/ai-onboarding";
import type { InitialMaster } from "./types";

const TOTAL_STEPS = 7;

type Segment = "mass" | "middle" | "premium" | "family" | "young-bold";
type CommStyle = "business" | "warm" | "direct" | "premium" | "architectural";

const SEGMENT_LABELS: { value: Segment; label: string; hint: string }[] = [
  { value: "mass", label: "Массовый сегмент", hint: "Эконом, новостройки, КПД" },
  { value: "middle", label: "Средний сегмент", hint: "Семьи, ремонт «для себя»" },
  { value: "premium", label: "Премиум", hint: "Элитная недвижимость, бутиковый подход" },
  { value: "family", label: "Семейный", hint: "Уют, дети, экологичность важнее всего" },
  { value: "young-bold", label: "Молодой смелый", hint: "Современные ЖК, быстро, ярко" },
];

const STYLE_LABELS: { value: CommStyle; label: string; hint: string }[] = [
  { value: "business", label: "Деловой", hint: "По делу, без эмоций" },
  { value: "warm", label: "Тёплый", hint: "По-человечески, как для своих" },
  { value: "direct", label: "Прямой", hint: "Коротко, бодро, можно на «ты»" },
  { value: "premium", label: "Премиум", hint: "Сдержанно, серьёзно, как Sotheby's" },
  { value: "architectural", label: "Архитектурный", hint: "Сухой, точный, конкретные цифры" },
];

export function OnboardingWizard({
  master,
  onDone,
  onSkip,
}: {
  master: InitialMaster;
  onDone: (result: OnboardingResult) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState(master.companyName ?? "");
  const [ownerName, setOwnerName] = useState(
    `${master.firstName} ${master.lastName ?? ""}`.trim()
  );
  const [city, setCity] = useState(master.address ?? "");

  const [yearsActive, setYearsActive] = useState<string>("");
  const [warrantyMaterialsYears, setWarrantyMaterialsYears] = useState<string>(
    String(master.warrantyMaterials ?? 10)
  );
  const [warrantyInstallYears, setWarrantyInstallYears] = useState<string>(
    String(master.warrantyInstall ?? 2)
  );

  const [segment, setSegment] = useState<Segment>("middle");
  const [communicationStyle, setCommunicationStyle] = useState<CommStyle>("warm");

  const [materialsUsed, setMaterialsUsed] = useState("");
  const [differentiator, setDifferentiator] = useState("");

  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [q3, setQ3] = useState("");

  const canGoNext = (): boolean => {
    if (step === 1) return companyName.trim().length > 0;
    return true;
  };

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai/kp-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          ownerName: ownerName.trim() || undefined,
          city: city.trim() || undefined,
          yearsActive: yearsActive ? Number(yearsActive) : undefined,
          warrantyMaterialsYears: warrantyMaterialsYears
            ? Number(warrantyMaterialsYears)
            : undefined,
          warrantyInstallYears: warrantyInstallYears
            ? Number(warrantyInstallYears)
            : undefined,
          segment,
          communicationStyle,
          materialsUsed: materialsUsed.trim() || undefined,
          differentiator: differentiator.trim() || undefined,
          commonQuestions: [q1, q2, q3].map((q) => q.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Ошибка генерации");
      }
      const result = (await res.json()) as OnboardingResult;
      toast.success("КП собран. Можно править");
      onDone(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Конструктор КП</h1>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Пропустить
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Шаг {step} из {TOTAL_STEPS}</CardTitle>
              <CardDescription>
                Ответьте на пару вопросов — AI соберёт вам КП в стиле вашего бренда
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round((step / TOTAL_STEPS) * 100)}%
            </span>
          </div>
          <Progress value={(step / TOTAL_STEPS) * 100} className="mt-3" />
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Название компании *</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Студия Уют"
                />
              </div>
              <div className="space-y-2">
                <Label>Имя мастера / владельца</Label>
                <Input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Аслан Серикович"
                />
              </div>
              <div className="space-y-2">
                <Label>Город</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Астана"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>С какого года работаете?</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={yearsActive}
                  onChange={(e) => setYearsActive(e.target.value)}
                  placeholder="2018"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Гарантия на плёнку (лет)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={warrantyMaterialsYears}
                    onChange={(e) => setWarrantyMaterialsYears(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Гарантия на работы (лет)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={warrantyInstallYears}
                    onChange={(e) => setWarrantyInstallYears(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Label>Сегмент клиентов</Label>
              <RadioGroup
                value={segment}
                onValueChange={(v) => setSegment(v as Segment)}
                className="gap-2"
              >
                {SEGMENT_LABELS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`seg-${opt.value}`}
                    className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent"
                  >
                    <RadioGroupItem value={opt.value} id={`seg-${opt.value}`} className="mt-1" />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.hint}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <Label>Стиль общения с клиентом</Label>
              <RadioGroup
                value={communicationStyle}
                onValueChange={(v) => setCommunicationStyle(v as CommStyle)}
                className="gap-2"
              >
                {STYLE_LABELS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`style-${opt.value}`}
                    className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent"
                  >
                    <RadioGroupItem value={opt.value} id={`style-${opt.value}`} className="mt-1" />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.hint}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2">
              <Label>Какие материалы используете чаще всего?</Label>
              <Textarea
                value={materialsUsed}
                onChange={(e) => setMaterialsUsed(e.target.value)}
                placeholder="Например: MSD Premium, Pongs, профили EuroKraab, LED-софиты Gauss"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                AI упомянет это в текстах гарантий и «О нас»
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-2">
              <Label>Чем отличаетесь от других мастеров? (необязательно)</Label>
              <Textarea
                value={differentiator}
                onChange={(e) => setDifferentiator(e.target.value)}
                placeholder="Например: делаем замер с 3D-визуализацией, держим цену в договоре, работаем без предоплаты"
                rows={4}
              />
            </div>
          )}

          {step === 7 && (
            <div className="space-y-3">
              <Label>3 самых частых вопроса клиентов (необязательно)</Label>
              <Input
                value={q1}
                onChange={(e) => setQ1(e.target.value)}
                placeholder="А плёнка точно безопасная?"
              />
              <Input
                value={q2}
                onChange={(e) => setQ2(e.target.value)}
                placeholder="Сколько по времени монтаж?"
              />
              <Input
                value={q3}
                onChange={(e) => setQ3(e.target.value)}
                placeholder="Когда платить?"
              />
              <p className="text-xs text-muted-foreground">
                AI напишет ответы на эти вопросы в FAQ-секции КП
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Назад
            </Button>

            {step < TOTAL_STEPS ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canGoNext() || submitting}
                className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              >
                Дальше
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Собираем...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Собрать мне КП
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
