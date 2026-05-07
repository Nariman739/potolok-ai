"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  Phone,
  DollarSign,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface OnboardingWizardProps {
  firstName: string;
  phone: string;
}

const KEY_PRICES = [
  { code: "canvas_320", name: "Полотно матовое 320см", unit: "м²", default: 2000 },
  { code: "canvas_550", name: "Полотно сатиновое 550см", unit: "м²", default: 2700 },
  { code: "profile_plastic", name: "Пластиковый профиль", unit: "м.п.", default: 500 },
  { code: "spot_ours", name: "Споты GX53 (наши)", unit: "шт.", default: 5000 },
  { code: "chandelier", name: "Закладная под люстру", unit: "шт.", default: 2000 },
  { code: "min_order", name: "Минимальный заказ", unit: "₸", default: 90000 },
];

export function OnboardingWizard({ firstName, phone }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 data
  const [city, setCity] = useState("");
  const [whatsapp, setWhatsapp] = useState(phone.replace("+7", ""));

  // Step 2 data
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(KEY_PRICES.map((p) => [p.code, String(p.default)]))
  );

  async function saveProfileAndPrices() {
    setSaving(true);
    try {
      // Save profile (city, whatsapp)
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: city || undefined,
          whatsappPhone: whatsapp ? `+7${whatsapp.replace(/\D/g, "")}` : undefined,
          onboardingCompleted: true,
        }),
      });
      if (!profileRes.ok) throw new Error("profile");

      // Save prices (only those user actually changed)
      const priceItems: { itemCode: string; price: number }[] = [];
      for (const item of KEY_PRICES) {
        const val = parseFloat(prices[item.code]);
        if (!isNaN(val) && val !== item.default) {
          priceItems.push({ itemCode: item.code, price: val });
        }
      }
      if (priceItems.length > 0) {
        const pricesRes = await fetch("/api/prices", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: priceItems }),
        });
        if (!pricesRes.ok) throw new Error("prices");
      }

      toast.success("Настройки сохранены!");
      router.refresh();
    } catch {
      toast.error("Ошибка сохранения. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
      router.refresh();
    } catch {
      toast.error("Ошибка. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="text-center pt-2">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1e3a5f]/10">
          <Sparkles className="h-7 w-7 text-[#1e3a5f]" />
        </div>
        <h1 className="text-2xl font-bold">Добро пожаловать, {firstName}!</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Настроим аккаунт за 2 минуты
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                i === step
                  ? "bg-[#1e3a5f] text-white"
                  : i < step
                    ? "bg-[#1e3a5f]/20 text-[#1e3a5f]"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < 2 && (
              <div
                className={`h-0.5 w-8 rounded ${
                  i < step ? "bg-[#1e3a5f]/30" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: City + WhatsApp */}
      {step === 0 && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center gap-2 text-[#1e3a5f]">
              <MapPin className="h-5 w-5" />
              <h2 className="font-semibold text-lg">Контакты</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Чтобы клиенты видели ваши контакты в коммерческом предложении
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="city">Город</Label>
                <Input
                  id="city"
                  placeholder="Астана, Алматы, Караганда..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp">
                  <Phone className="h-3.5 w-3.5 inline mr-1" />
                  WhatsApp для клиентов
                </Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
                    +7
                  </span>
                  <Input
                    id="whatsapp"
                    type="tel"
                    placeholder="700 123 4567"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="rounded-l-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Будет показан в КП — клиент сможет написать напрямую
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Key prices */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center gap-2 text-[#1e3a5f]">
              <DollarSign className="h-5 w-5" />
              <h2 className="font-semibold text-lg">Ваши цены</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Укажите основные цены. Остальные можно настроить позже в разделе
              «Цены»
            </p>

            <div className="space-y-3">
              {KEY_PRICES.map((item) => (
                <div key={item.code} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.unit}</p>
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      value={prices[item.code]}
                      onChange={(e) =>
                        setPrices((prev) => ({
                          ...prev,
                          [item.code]: e.target.value,
                        }))
                      }
                      className="text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === 2 && (
        <Card className="border-[#1e3a5f]/20 bg-gradient-to-br from-[#1e3a5f]/5 to-transparent">
          <CardContent className="py-10 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1e3a5f]/10">
              <Rocket className="h-8 w-8 text-[#1e3a5f]" />
            </div>
            <h2 className="text-xl font-bold">Всё готово!</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Теперь можете создать первый расчёт через AI Ассистент или
              Калькулятор. Замеры, цены и профиль — настраивайте в любое время.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Назад
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleSkip}
              disabled={saving}
            >
              Пропустить
            </Button>
          )}
        </div>
        <div>
          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              className="bg-[#1e3a5f] hover:bg-[#152d4a]"
            >
              Далее
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={saveProfileAndPrices}
              className="bg-[#1e3a5f] hover:bg-[#152d4a]"
              disabled={saving}
            >
              {saving ? "Сохраняю..." : "Начать работу!"}
              {!saving && <Rocket className="h-4 w-4 ml-1" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
