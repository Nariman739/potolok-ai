import { AI_MODEL, getOpenRouter } from "@/lib/openrouter";
import type {
  KpConfig,
  KpTemplateId,
  FaqItem,
  WarrantyItem,
  QuickIncludedItem,
} from "./types";
import { getDefaultConfigForTemplate } from "./templates";

// ============================================
// AI-онбординг конструктора КП.
//
// Мастер заходит первый раз → отвечает на 6-7 простых вопросов →
// AI собирает ему персональный КП:
//   — выбирает тему под стиль и сегмент
//   — пишет tagline
//   — заполняет warranties под цифры мастера
//   — генерит FAQ под сегмент
//   — пишет about-body
//   — заполняет 3 квадрата Quick КП
//
// Результат — готовый KpConfig, который сразу можно сохранить в Master.kpConfig.
// ============================================

export type MasterBrief = {
  companyName: string;
  ownerName?: string;
  city?: string;
  yearsActive?: number; // с какого года
  // Сегмент клиентов
  segment: "mass" | "middle" | "premium" | "family" | "young-bold";
  // Используемые материалы (свободный текст)
  materialsUsed?: string;
  // Гарантии
  warrantyMaterialsYears?: number;
  warrantyInstallYears?: number;
  // Чем отличается от конкурентов (1-2 предложения)
  differentiator?: string;
  // Стиль общения с клиентом
  communicationStyle?: "business" | "warm" | "direct" | "premium" | "architectural";
  // Какие 3 вопроса чаще всего задают клиенты (опционально)
  commonQuestions?: string[];
};

export type OnboardingResult = {
  template: KpTemplateId;
  tagline: string;
  config: KpConfig;
  rationale: string; // короткое объяснение почему выбрана такая тема и тексты
};

// ============================================
// Маппинг segment + style → стартовая тема
// ============================================
function suggestTemplate(brief: MasterBrief): KpTemplateId {
  const { segment, communicationStyle: cs } = brief;

  if (segment === "premium" || cs === "premium") return "premium-dark";
  if (segment === "family" || cs === "warm") return "warm-handmade";
  if (segment === "young-bold" || cs === "direct") return "bold-color";
  if (cs === "architectural") return "classic-architectural";
  // mass/middle + business — нейтральный
  return "minimal";
}

// ============================================
// Основная функция
// ============================================
export async function generateKpConfigFromBrief(
  brief: MasterBrief
): Promise<OnboardingResult> {
  const template = suggestTemplate(brief);
  const baseConfig = getDefaultConfigForTemplate(template);

  // Готовим промпт для AI — он заполняет всё содержимое одним вызовом
  const systemPrompt = `Ты — копирайтер для мастеров натяжных потолков в Казахстане. На основе короткого брифа от мастера ты собираешь персональный пакет текстов для его коммерческого предложения.

Тон ответа выбирается по сегменту и стилю:
— premium → серьёзный, бутиковый, как Sotheby's
— family/warm → тёплый, заботливый, по-семейному
— young-bold/direct → бодрый, прямой, можно на «ты»
— architectural → точный, сухой, конкретные цифры
— mass/business → лаконичный, нейтральный, по делу

ВАЖНО:
— Пиши на русском, естественно, без штампов («индивидуальный подход», «премиум-качество», «лучшие на рынке»)
— Не используй эмодзи
— Не выдумывай цифры, если их нет в брифе
— Учитывай что клиент мастера — обычный человек в Казахстане
— Все тексты должны звучать как от живого человека, а не от шаблона

ОТВЕТ строго в JSON:
{
  "tagline": "короткий слоган компании, 5-9 слов",
  "warranties": [
    { "title": "Гарантия на плёнку", "value": "10 лет" },
    { "title": "Гарантия на монтаж", "value": "2 года" },
    { "title": "...", "value": "..." }
  ],
  "faq": [
    { "q": "вопрос?", "a": "ответ 30-60 слов" },
    { "q": "вопрос?", "a": "ответ" },
    { "q": "вопрос?", "a": "ответ" },
    { "q": "вопрос?", "a": "ответ" }
  ],
  "aboutTitle": "Кто мы (или другое 1-3 слова)",
  "aboutBody": "О компании 40-80 слов",
  "quickHeroTitle": "обращение к клиенту в Quick КП без имени — например 'Вот примерная стоимость по вашей квартире'",
  "quickPriceDisclaimer": "объяснение под ценой почему ориентир, 25-45 слов",
  "quickItems": [
    { "title": "1-3 слова", "body": "12-25 слов" },
    { "title": "1-3 слова", "body": "12-25 слов" },
    { "title": "1-3 слова", "body": "12-25 слов" }
  ],
  "rationale": "1-2 предложения почему выбраны такие тексты — почему они подходят этому мастеру"
}`;

  const userPrompt = `Бриф мастера:
— Компания: ${brief.companyName}
${brief.ownerName ? `— Мастер: ${brief.ownerName}\n` : ""}${brief.city ? `— Город: ${brief.city}\n` : ""}${brief.yearsActive ? `— Работает с ${brief.yearsActive} года\n` : ""}— Сегмент клиентов: ${brief.segment}
${brief.communicationStyle ? `— Стиль общения: ${brief.communicationStyle}\n` : ""}${brief.materialsUsed ? `— Какие материалы использует: ${brief.materialsUsed}\n` : ""}— Гарантия на плёнку: ${brief.warrantyMaterialsYears ?? 10} лет
— Гарантия на работы: ${brief.warrantyInstallYears ?? 2} лет
${brief.differentiator ? `— Чем отличается от других: ${brief.differentiator}\n` : ""}${brief.commonQuestions?.length ? `— Частые вопросы клиентов:\n${brief.commonQuestions.map((q) => `  — ${q}`).join("\n")}\n` : ""}

Выбранная для него визуальная тема (для контекста, не меняй её): ${template}

Сгенерируй персональный пакет текстов для этого мастера.`;

  const client = getOpenRouter();
  const completion = await client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 2500,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  // OpenRouter с моделью Claude иногда игнорирует response_format и возвращает
  // JSON завёрнутым в ```json ... ``` markdown-fence. Снимаем обёртку, если есть
  // (Нариман 26.05.26: «Unexpected token '`'» на шаге 7 онбординга бренда).
  const cleaned = (() => {
    const t = raw.trim();
    const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    return m ? m[1].trim() : t;
  })();
  const parsed = JSON.parse(cleaned) as Partial<{
    tagline: string;
    warranties: WarrantyItem[];
    faq: FaqItem[];
    aboutTitle: string;
    aboutBody: string;
    quickHeroTitle: string;
    quickPriceDisclaimer: string;
    quickItems: QuickIncludedItem[];
    rationale: string;
  }>;

  // Собираем итоговый KpConfig: берём дефолт для темы и подменяем тексты.
  const config: KpConfig = {
    ...baseConfig,
    sections: baseConfig.sections.map((s) => {
      if (s.type === "warranties" && parsed.warranties?.length) {
        return { ...s, items: parsed.warranties.slice(0, 4) };
      }
      if (s.type === "faq" && parsed.faq?.length) {
        return { ...s, items: parsed.faq.slice(0, 6) };
      }
      if (s.type === "about" && (parsed.aboutTitle || parsed.aboutBody)) {
        return {
          ...s,
          enabled: true,
          title: parsed.aboutTitle ?? s.title,
          body: parsed.aboutBody ?? s.body,
        };
      }
      return s;
    }),
    quick: {
      heroTitle: parsed.quickHeroTitle ?? null,
      priceDisclaimer: parsed.quickPriceDisclaimer ?? null,
      items: parsed.quickItems?.length === 3 ? parsed.quickItems : null,
    },
  };

  return {
    template,
    tagline: parsed.tagline ?? `Натяжные потолки${brief.city ? ` в ${brief.city}` : ""}`,
    config,
    rationale:
      parsed.rationale ??
      `Тема ${template} подобрана под сегмент ${brief.segment} и стиль ${brief.communicationStyle ?? "по умолчанию"}.`,
  };
}
