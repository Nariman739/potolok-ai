"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ALL_TEMPLATES, FONT_PAIRS } from "@/lib/kp/themes";
import type {
  KpConfig,
  KpSection,
  KpTemplateId,
  KpFontPairId,
  WarrantyItem,
  FaqItem,
  QuickIncludedItem,
} from "@/lib/kp/types";
import { PdfPreview } from "./PdfPreview";
import { AiSuggestButton } from "./AiSuggestButton";
import type { InitialMaster } from "./types";

// Главный редактор КП. Слева — настройки, справа — live-превью PDF.
// AI-кнопки на каждом текстовом поле подсказывают варианты под тему мастера.

const TEMPLATE_LABELS: Record<KpTemplateId, { label: string; segment: string }> = {
  minimal: { label: "Минимализм", segment: "Универсальный нейтральный" },
  "premium-dark": { label: "Премиум Dark", segment: "Премиум-сегмент" },
  "warm-handmade": { label: "Тёплый", segment: "Семейные квартиры" },
  "classic-architectural": { label: "Архитектурный", segment: "Дизайнерская недвижимость" },
  "bold-color": { label: "Bold Color", segment: "Молодой смелый бренд" },
};

export function BrandingEditor({
  master,
  onMasterChange,
  config,
  onConfigChange,
  rationale,
  onReopenWizard,
}: {
  master: InitialMaster;
  onMasterChange: (m: InitialMaster) => void;
  config: KpConfig;
  onConfigChange: (c: KpConfig) => void;
  rationale: string | null;
  onReopenWizard: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const aiContext = {
    template: config.template,
    companyName: master.companyName ?? undefined,
    ownerName: `${master.firstName} ${master.lastName ?? ""}`.trim(),
    city: master.address ?? undefined,
  };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/master/me/kp-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpConfig: config,
          tagline: master.tagline,
          coverPhotoUrl: master.coverPhotoUrl,
          brandColor: master.brandColor,
        }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить");
      toast.success("Настройки сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleCoverUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/master/me/upload-cover", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("Не удалось загрузить");
      const { url } = (await res.json()) as { url: string };
      onMasterChange({ ...master, coverPhotoUrl: url });
      toast.success("Обложка загружена");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setUploading(false);
    }
  }

  // ============================================
  // Хелперы для модификации kpConfig секций
  // ============================================
  const sections = config.sections;
  const toggleSection = (idx: number, enabled: boolean) => {
    const next = [...sections];
    const s = next[idx];
    if ("enabled" in s) next[idx] = { ...s, enabled };
    onConfigChange({ ...config, sections: next });
  };

  const findSection = <T extends KpSection["type"]>(type: T) =>
    sections.find((s) => s.type === type) as Extract<KpSection, { type: T }> | undefined;

  const updateSection = <T extends KpSection["type"]>(
    type: T,
    patch: Partial<Extract<KpSection, { type: T }>>
  ) => {
    const next = sections.map((s) =>
      s.type === type ? ({ ...s, ...patch } as KpSection) : s
    );
    onConfigChange({ ...config, sections: next });
  };

  const warranties = findSection("warranties");
  const faq = findSection("faq");
  const about = findSection("about");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,540px)] gap-6">
      {/* ============================================
          ЛЕВО — настройки
          ============================================ */}
      <div className="space-y-6 min-w-0">
        {rationale && (
          <Card className="p-4 bg-violet-50/40 border-violet-200">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
              <div className="text-sm text-violet-900">
                <div className="font-semibold mb-1">AI подобрал настройки под вас</div>
                <p className="text-violet-800">{rationale}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReopenWizard}
                className="ml-auto shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Перепройти
              </Button>
            </div>
          </Card>
        )}

        {/* Тема */}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-1">Тема оформления</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Базовый стиль КП. Цвета и шрифты можно изменить ниже.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ALL_TEMPLATES.map((t) => {
              const isActive = config.template === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onConfigChange({ ...config, template: t })}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    isActive
                      ? "border-violet-600 bg-violet-50/40 ring-1 ring-violet-600"
                      : "border-border hover:border-violet-300"
                  }`}
                >
                  <div className="font-medium text-sm">{TEMPLATE_LABELS[t].label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {TEMPLATE_LABELS[t].segment}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Бренд */}
        <Card className="p-5 space-y-4">
          <h3 className="text-base font-semibold">Бренд</h3>

          <div>
            <Label htmlFor="brandColor">Фирменный цвет</Label>
            <div className="flex gap-2 mt-2 items-center">
              <input
                id="brandColor"
                type="color"
                value={master.brandColor}
                onChange={(e) =>
                  onMasterChange({ ...master, brandColor: e.target.value })
                }
                className="h-10 w-16 cursor-pointer rounded border border-input"
              />
              <Input
                value={master.brandColor}
                onChange={(e) =>
                  onMasterChange({ ...master, brandColor: e.target.value })
                }
                className="w-32 font-mono text-xs"
                placeholder="#1E3A5F"
              />
              <div className="flex gap-1">
                {["#1E3A5F", "#E85D04", "#D4AF37", "#C8553D", "#6B2737"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onMasterChange({ ...master, brandColor: c })}
                    className="h-7 w-7 rounded border border-input"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label>Шрифты</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(Object.keys(FONT_PAIRS) as KpFontPairId[]).map((id) => {
                const pair = FONT_PAIRS[id];
                const isActive =
                  (config.fontPair ?? null) === id ||
                  (!config.fontPair && id === "inter" && config.template === "minimal");
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onConfigChange({ ...config, fontPair: id })}
                    className={`text-left p-2.5 rounded-lg border text-sm transition-colors ${
                      isActive
                        ? "border-violet-600 bg-violet-50/40 ring-1 ring-violet-600"
                        : "border-border hover:border-violet-300"
                    }`}
                  >
                    <div className="font-medium">{pair.label.split("(")[0].trim()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {pair.display.family} + {pair.body.family}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="tagline">Слоган компании</Label>
              <AiSuggestButton
                field="tagline"
                context={{ ...aiContext, currentValue: master.tagline ?? undefined }}
                onPick={(text) => onMasterChange({ ...master, tagline: text })}
              />
            </div>
            <Textarea
              id="tagline"
              value={master.tagline ?? ""}
              onChange={(e) => onMasterChange({ ...master, tagline: e.target.value })}
              placeholder="Натяжные потолки в Астане с 2018"
              rows={2}
              maxLength={120}
            />
          </div>

          <div>
            <Label>Фон обложки (опционально)</Label>
            <div className="flex gap-2 mt-2 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCoverUpload(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  asChild
                >
                  <span>
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-2" />
                    )}
                    {master.coverPhotoUrl ? "Заменить" : "Загрузить"}
                  </span>
                </Button>
              </label>
              {master.coverPhotoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onMasterChange({ ...master, coverPhotoUrl: null })}
                >
                  Убрать
                </Button>
              )}
            </div>
            {master.coverPhotoUrl && (
              <div className="mt-3 text-xs text-muted-foreground break-all">
                {master.coverPhotoUrl}
              </div>
            )}
          </div>
        </Card>

        {/* Секции — включение/выключение */}
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-1">Состав КП</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Включите или выключите блоки в полном КП.
          </p>
          <div className="space-y-2.5">
            {sections.map((s, idx) => {
              if (s.type === "cover" || s.type === "breakdown" || s.type === "contacts") {
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm py-2"
                  >
                    <span className="text-muted-foreground">
                      {sectionLabel(s.type)}{" "}
                      <span className="text-xs">— всегда включена</span>
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <Label htmlFor={`section-${idx}`} className="cursor-pointer">
                    {sectionLabel(s.type)}
                  </Label>
                  <Switch
                    id={`section-${idx}`}
                    checked={s.enabled}
                    onCheckedChange={(v) => toggleSection(idx, v)}
                  />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Quick КП — контент */}
        <Card className="p-5 space-y-4">
          <h3 className="text-base font-semibold">Быстрое КП (одна страница)</h3>
          <p className="text-sm text-muted-foreground -mt-3">
            Тексты для случая «клиент позвонил, спросил примерную цену».
          </p>

          <QuickFieldsEditor config={config} onChange={onConfigChange} ctx={aiContext} />
        </Card>

        {/* Гарантии */}
        {warranties && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Гарантии</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={warranties.items.length >= 4}
                onClick={() => {
                  const items = [...warranties.items, { title: "", value: "" }];
                  updateSection("warranties", { items });
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Добавить
              </Button>
            </div>
            <div className="space-y-3">
              {warranties.items.map((it, i) => (
                <WarrantyRow
                  key={i}
                  item={it}
                  onChange={(item) => {
                    const items = [...warranties.items];
                    items[i] = item;
                    updateSection("warranties", { items });
                  }}
                  onDelete={() => {
                    const items = warranties.items.filter((_, j) => j !== i);
                    updateSection("warranties", { items });
                  }}
                  ctx={aiContext}
                />
              ))}
            </div>
          </Card>
        )}

        {/* FAQ */}
        {faq && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Частые вопросы</h3>
              <Button
                variant="outline"
                size="sm"
                disabled={faq.items.length >= 6}
                onClick={() => {
                  const items = [...faq.items, { q: "", a: "" }];
                  updateSection("faq", { items });
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Добавить вопрос
              </Button>
            </div>
            <div className="space-y-4">
              {faq.items.map((it, i) => (
                <FaqRow
                  key={i}
                  item={it}
                  index={i}
                  onChange={(item) => {
                    const items = [...faq.items];
                    items[i] = item;
                    updateSection("faq", { items });
                  }}
                  onDelete={() => {
                    const items = faq.items.filter((_, j) => j !== i);
                    updateSection("faq", { items });
                  }}
                  ctx={aiContext}
                />
              ))}
            </div>
          </Card>
        )}

        {/* About */}
        {about && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">О компании</h3>
              <Switch
                checked={about.enabled}
                onCheckedChange={(v) => updateSection("about", { enabled: v })}
              />
            </div>
            {about.enabled && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Заголовок</Label>
                    <AiSuggestButton
                      field="about.title"
                      context={{ ...aiContext, currentValue: about.title }}
                      onPick={(text) => updateSection("about", { title: text })}
                    />
                  </div>
                  <Input
                    value={about.title}
                    onChange={(e) => updateSection("about", { title: e.target.value })}
                    placeholder="Кто мы"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Текст</Label>
                    <AiSuggestButton
                      field="about.body"
                      context={{ ...aiContext, currentValue: about.body }}
                      onPick={(text) => updateSection("about", { body: text })}
                    />
                  </div>
                  <Textarea
                    value={about.body}
                    onChange={(e) => updateSection("about", { body: e.target.value })}
                    placeholder="40-80 слов о компании"
                    rows={4}
                  />
                </div>
              </>
            )}
          </Card>
        )}

        {/* Save button */}
        <div className="sticky bottom-4 z-10">
          <Button
            size="lg"
            className="w-full shadow-lg"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Сохранить настройки КП
          </Button>
        </div>
      </div>

      {/* ============================================
          ПРАВО — превью PDF
          ============================================ */}
      <div className="min-w-0">
        <PdfPreview
          config={config}
          brandColor={master.brandColor}
          tagline={master.tagline}
          coverPhotoUrl={master.coverPhotoUrl}
        />
      </div>
    </div>
  );
}

// ============================================
// Под-компоненты
// ============================================

function sectionLabel(type: KpSection["type"]): string {
  switch (type) {
    case "cover":
      return "Обложка";
    case "breakdown":
      return "Разбор по комнатам";
    case "portfolio":
      return "Галерея работ";
    case "warranties":
      return "Гарантии";
    case "reviews":
      return "Отзывы клиентов";
    case "faq":
      return "Частые вопросы";
    case "about":
      return "О компании";
    case "contacts":
      return "Контакты";
  }
}

function WarrantyRow({
  item,
  onChange,
  onDelete,
  ctx,
}: {
  item: WarrantyItem;
  onChange: (i: WarrantyItem) => void;
  onDelete: () => void;
  ctx: { template: KpTemplateId; companyName?: string; ownerName?: string; city?: string };
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
      <div>
        <Label className="text-xs">Заголовок</Label>
        <div className="flex gap-1">
          <Input
            value={item.title}
            onChange={(e) => onChange({ ...item, title: e.target.value })}
            placeholder="Гарантия на плёнку"
          />
          <AiSuggestButton
            field="warranties.itemTitle"
            context={{ ...ctx, currentValue: item.title }}
            onPick={(text) => onChange({ ...item, title: text })}
            label=""
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Значение</Label>
        <div className="flex gap-1">
          <Input
            value={item.value}
            onChange={(e) => onChange({ ...item, value: e.target.value })}
            placeholder="10 лет от производителя"
          />
          <AiSuggestButton
            field="warranties.itemValue"
            context={{ ...ctx, currentValue: item.value }}
            onPick={(text) => onChange({ ...item, value: text })}
            label=""
          />
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function FaqRow({
  item,
  index,
  onChange,
  onDelete,
  ctx,
}: {
  item: FaqItem;
  index: number;
  onChange: (i: FaqItem) => void;
  onDelete: () => void;
  ctx: { template: KpTemplateId; companyName?: string; ownerName?: string; city?: string };
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono">
          #{String(index + 1).padStart(2, "0")}
        </span>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Вопрос</Label>
          <AiSuggestButton
            field="faq.q"
            context={{ ...ctx, currentValue: item.q }}
            onPick={(text) => onChange({ ...item, q: text })}
          />
        </div>
        <Input
          value={item.q}
          onChange={(e) => onChange({ ...item, q: e.target.value })}
          placeholder="Что если плёнка порвётся?"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Ответ</Label>
          <AiSuggestButton
            field="faq.a"
            context={{ ...ctx, currentValue: item.a, question: item.q }}
            onPick={(text) => onChange({ ...item, a: text })}
          />
        </div>
        <Textarea
          value={item.a}
          onChange={(e) => onChange({ ...item, a: e.target.value })}
          rows={3}
          placeholder="Развёрнутый ответ"
        />
      </div>
    </div>
  );
}

function QuickFieldsEditor({
  config,
  onChange,
  ctx,
}: {
  config: KpConfig;
  onChange: (c: KpConfig) => void;
  ctx: { template: KpTemplateId; companyName?: string; ownerName?: string; city?: string };
}) {
  const quick = config.quick ?? {};

  const update = (patch: Partial<NonNullable<KpConfig["quick"]>>) => {
    onChange({ ...config, quick: { ...quick, ...patch } });
  };

  const items: QuickIncludedItem[] =
    quick.items ?? [
      { title: "Замер на дому", body: "" },
      { title: "Материалы", body: "" },
      { title: "Монтаж от одного дня", body: "" },
    ];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Заголовок (обращение к клиенту)</Label>
          <AiSuggestButton
            field="quick.heroTitle"
            context={{ ...ctx, currentValue: quick.heroTitle ?? undefined }}
            onPick={(text) => update({ heroTitle: text })}
          />
        </div>
        <Textarea
          value={quick.heroTitle ?? ""}
          onChange={(e) => update({ heroTitle: e.target.value || null })}
          placeholder="Айгуль, вот примерная стоимость по вашей квартире"
          rows={2}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Дисклеймер под ценой</Label>
          <AiSuggestButton
            field="quick.priceDisclaimer"
            context={{ ...ctx, currentValue: quick.priceDisclaimer ?? undefined }}
            onPick={(text) => update({ priceDisclaimer: text })}
          />
        </div>
        <Textarea
          value={quick.priceDisclaimer ?? ""}
          onChange={(e) => update({ priceDisclaimer: e.target.value || null })}
          placeholder="Это ориентир. Финальная сумма — на замере..."
          rows={3}
        />
      </div>

      <div className="space-y-3">
        <Label className="text-xs">Три пункта «Что вы получаете»</Label>
        {items.map((it, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Заголовок</Label>
                <AiSuggestButton
                  field="quick.itemTitle"
                  context={{
                    ...ctx,
                    currentValue: it.title,
                    item: { kind: "quick-item", position: i + 1 },
                  }}
                  onPick={(text) => {
                    const next = [...items];
                    next[i] = { ...next[i], title: text };
                    update({ items: next });
                  }}
                />
              </div>
              <Input
                value={it.title}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], title: e.target.value };
                  update({ items: next });
                }}
                placeholder="Замер на дому"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Описание</Label>
                <AiSuggestButton
                  field="quick.itemBody"
                  context={{
                    ...ctx,
                    currentValue: it.body,
                    item: { kind: it.title || "quick-item", position: i + 1 },
                  }}
                  onPick={(text) => {
                    const next = [...items];
                    next[i] = { ...next[i], body: text };
                    update({ items: next });
                  }}
                />
              </div>
              <Textarea
                value={it.body}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], body: e.target.value };
                  update({ items: next });
                }}
                rows={2}
                placeholder="12-25 слов"
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Подпись над WhatsApp-кнопкой</Label>
          <AiSuggestButton
            field="quick.ctaLabel"
            context={{ ...ctx, currentValue: quick.ctaLabel ?? undefined }}
            onPick={(text) => update({ ctaLabel: text })}
          />
        </div>
        <Input
          value={quick.ctaLabel ?? ""}
          onChange={(e) => update({ ctaLabel: e.target.value || null })}
          placeholder="Написать в WhatsApp · ответим за 15 минут"
        />
      </div>
    </div>
  );
}
