import { AI_MODEL, getOpenRouter } from "@/lib/openrouter";
import { computeCostFromUsage } from "@/lib/ai-cost-cap";
import type { KpTemplateId } from "./types";

// ============================================
// AI-помощник для подсказки текстов в конструкторе КП.
// Один endpoint /api/ai/copy-suggest, разные поля — разные промпты.
// Все промпты учитывают тон выбранной темы и контекст мастера.
// ============================================

export type CopyFieldKind =
  // Бренд мастера
  | "tagline" // короткий слоган компании (5-8 слов)
  | "bio" // мини-описание для портфолио (1-2 предложения)
  // Quick КП
  | "quick.heroTitle" // обращение к клиенту
  | "quick.pricePreLabel" // лейбл над ценой
  | "quick.priceDisclaimer" // объяснение почему ориентир
  | "quick.itemsTitle" // заголовок блока «Что вы получаете»
  | "quick.itemTitle" // заголовок одного из 3 квадратов
  | "quick.itemBody" // описание квадрата
  | "quick.ctaLabel" // подпись над WhatsApp-кнопкой
  // Full КП
  | "warranties.itemTitle" // например «Гарантия на плёнку»
  | "warranties.itemValue" // например «10 лет от производителя»
  | "faq.q" // вопрос
  | "faq.a" // ответ
  | "about.title" // «Кто мы»
  | "about.body" // 2-4 предложения о компании
  // Портфолио
  | "portfolio.title" // «Двухуровневый потолок в гостиной»
  | "portfolio.description"; // короткое описание работы

export type CopyContext = {
  template?: KpTemplateId;
  companyName?: string;
  ownerName?: string;
  city?: string;
  currentValue?: string; // если мастер хочет «улучшить то что есть»
  // Доп.контекст для конкретных полей
  client?: { name?: string; address?: string; area?: number; rooms?: number };
  item?: { kind?: string; position?: number }; // для quick.itemTitle/Body
  question?: string; // для faq.a — даём AI вопрос, чтобы он ответил
};

export type CopySuggestion = { text: string; rationale?: string };

// ============================================
// Тон под тему — главная подсказка для AI
// ============================================
const TONE_BY_TEMPLATE: Record<KpTemplateId, string> = {
  minimal:
    "Лаконичный, нейтральный, без эмоциональных штампов. По делу, без воды. Подходит универсальному клиенту.",
  "premium-dark":
    "Серьёзный, премиальный, сдержанный. Подчёркивает эксклюзивность материалов и опыт мастера. Без восклицаний и сленга. Скорее «бутиковый» тон, как у Sotheby's или Tom Ford.",
  "warm-handmade":
    "Тёплый, заботливый, как будто мастер обращается к семье. Без официоза. Подчёркивает что работа делается «вручную, с душой, для вашего дома». Можно говорить про детей, уют, чистоту.",
  "classic-architectural":
    "Сухой, точный, архитектурный. Конкретные цифры, никаких метафор. Подходит для работы с дизайнерами и владельцами элитной недвижимости.",
  "bold-color":
    "Бодрый, прямой, энергичный. Короткие фразы. Подходит молодому бренду. Можно говорить на «ты». Никаких сложных оборотов.",
};

// ============================================
// Конфиг под каждое поле — длина, тон, конкретные правила
// ============================================
type FieldSpec = {
  description: string; // что это за поле в контексте КП
  rules: string; // правила длины, тона, форматирования
  examples?: string[]; // 1-2 примера хороших вариантов
};

const FIELD_SPECS: Record<CopyFieldKind, FieldSpec> = {
  tagline: {
    description: "Короткий слоган компании, показывается в шапке всех КП.",
    rules:
      "5-9 слов. Один тезис: чем занимаемся + где/с какого года/особенность. Никаких «лучшие в городе», «премиум-качество», «индивидуальный подход» — это пустые штампы.",
    examples: [
      "Натяжные потолки в Астане с 2018",
      "Делаем потолки, которые не стыдно показать гостям",
      "Бесшовные потолки в новостройках Алматы",
    ],
  },
  bio: {
    description: "Мини-описание компании для публичной страницы портфолио.",
    rules:
      "1-2 коротких предложения. Кто, что делаем, почему нам можно доверять. Конкретные факты (стаж, кол-во объектов, гарантия), а не общие слова.",
  },

  "quick.heroTitle": {
    description:
      "Обращение к клиенту в одностраничном «быстром» КП. Это то, что клиент видит крупно сразу.",
    rules:
      "Личное, по имени если имя дано. Не uppercase. 6-14 слов. Должно звучать как первая фраза мастера в WhatsApp.",
    examples: [
      "Айгуль, вот примерная стоимость по вашей квартире",
      "Серикбай, посчитал примерно по вашему техпаспорту",
      "Аружан, по фото комнаты прикинул цену",
    ],
  },
  "quick.pricePreLabel": {
    description: "Маленькая подпись над крупной ценой.",
    rules:
      "3-7 слов, UPPERCASE будет применён автоматически — пиши обычным. Объясняет, что входит в цену.",
    examples: [
      "Полная стоимость работ с материалами",
      "Под ключ, с материалами и монтажом",
      "С учётом всех материалов",
    ],
  },
  "quick.priceDisclaimer": {
    description: "Объяснение под ценой почему это ориентир и приглашение на замер.",
    rules:
      "25-45 слов. 2-3 предложения. Объясни почему примерная (нюансы реальной квартиры), напомни что замер бесплатный. Без юридического тона.",
  },
  "quick.itemsTitle": {
    description: "Маленький заголовок над 3 квадратами с тем, что входит.",
    rules: "2-4 слова, обычный регистр.",
    examples: ["Что вы получаете", "Что входит в работу", "Этапы и что вы получаете"],
  },
  "quick.itemTitle": {
    description: "Заголовок одного из 3 квадратов (Замер / Материалы / Монтаж и т.п.).",
    rules: "1-3 слова. Конкретное действие или этап. Без банальностей.",
    examples: [
      "Замер на дому",
      "Материалы в комплекте",
      "Монтаж от одного дня",
      "Чистая работа",
      "Гарантия 10 лет",
    ],
  },
  "quick.itemBody": {
    description: "Описание квадрата под заголовком.",
    rules:
      "12-25 слов. 1-2 коротких предложения. Конкретные обещания (что делаем, что НЕ нужно делать клиенту, какая гарантия). Без воды.",
  },
  "quick.ctaLabel": {
    description: "Подпись над зелёной WhatsApp-кнопкой.",
    rules:
      "5-10 слов. Призывает написать/позвонить. Можно добавить обещание скорости («ответим за 15 минут»).",
    examples: [
      "Написать в WhatsApp · ответим за 15 минут",
      "Записаться на бесплатный замер",
      "Обсудить детали и согласовать дату",
    ],
  },

  "warranties.itemTitle": {
    description: "Заголовок одной плашки гарантии.",
    rules: "2-4 слова, конкретно что гарантируем.",
    examples: ["Гарантия на плёнку", "Гарантия на монтаж", "Договор онлайн"],
  },
  "warranties.itemValue": {
    description: "Значение гарантии — крупная цифра/фраза в плашке.",
    rules: "2-5 слов. Конкретика (срок, формат, бренд).",
    examples: ["10 лет от производителя", "2 года от мастерской", "Электронная подпись"],
  },
  "faq.q": {
    description: "Вопрос в блоке FAQ.",
    rules:
      "Реальный вопрос клиента, который часто звучит вживую. С вопросительным знаком. 5-12 слов.",
    examples: [
      "Что если плёнка порвётся?",
      "Сколько занимает монтаж?",
      "А плёнка точно безопасная для детей?",
    ],
  },
  "faq.a": {
    description: "Ответ на вопрос FAQ.",
    rules:
      "30-60 слов. 2-3 предложения. Прямой ответ, без юридических оговорок. Учитывай тон темы.",
  },
  "about.title": {
    description: "Заголовок секции «О нас».",
    rules: "1-3 слова.",
    examples: ["Кто мы", "О мастерской", "Наша команда"],
  },
  "about.body": {
    description: "Короткий текст «О нас» — 2-4 предложения.",
    rules:
      "40-80 слов. Кто, с какого года, чем отличаемся (конкретные факты, не штампы), почему клиенту с нами хорошо.",
  },

  "portfolio.title": {
    description: "Название работы в портфолио.",
    rules: "3-7 слов. Тип потолка + помещение/особенность.",
    examples: [
      "Двухуровневый потолок с подсветкой в гостиной",
      "Парящий потолок в спальне",
      "Световая линия в коридоре",
    ],
  },
  "portfolio.description": {
    description: "Описание работы в портфолио — 1-2 предложения.",
    rules:
      "15-30 слов. Конкретные детали проекта (материал, конструктив, особенности), без «прекрасный результат».",
  },
};

// ============================================
// Основная функция: возвращает n вариантов текста
// ============================================
export async function suggestCopy(
  field: CopyFieldKind,
  context: CopyContext,
  n = 3
): Promise<{ suggestions: CopySuggestion[]; costUsd: number }> {
  const spec = FIELD_SPECS[field];
  const tone =
    (context.template && TONE_BY_TEMPLATE[context.template]) ||
    TONE_BY_TEMPLATE.minimal;

  const systemPrompt = buildSystemPrompt({ spec, tone, context, n });
  const userPrompt = buildUserPrompt({ spec, context });

  const client = getOpenRouter();
  const completion = await client.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.85,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });
  const costUsd = computeCostFromUsage(completion.usage, AI_MODEL);

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { suggestions?: CopySuggestion[] };
    const suggestions = (parsed.suggestions ?? [])
      .filter((s) => s && typeof s.text === "string" && s.text.trim().length > 0)
      .slice(0, n);
    return {
      suggestions:
        suggestions.length > 0
          ? suggestions
          : [{ text: "Не удалось сгенерировать варианты, попробуйте ещё раз." }],
      costUsd,
    };
  } catch {
    return {
      suggestions: [{ text: "Ошибка парсинга ответа AI. Попробуйте ещё раз." }],
      costUsd,
    };
  }
}

// ============================================
// Промпт-строители
// ============================================
function buildSystemPrompt({
  spec,
  tone,
  context,
  n,
}: {
  spec: FieldSpec;
  tone: string;
  context: CopyContext;
  n: number;
}): string {
  const examples = spec.examples
    ? `\n\nПримеры удачных формулировок (НЕ копируй буквально, бери идею):\n${spec.examples.map((e) => `— ${e}`).join("\n")}`
    : "";

  return `Ты — копирайтер для мастеров натяжных потолков в Казахстане. Пишешь тексты для коммерческих предложений (КП), которые мастер отправляет клиенту в WhatsApp.

ТОН для этой темы:
${tone}

ВАЖНО:
— Пиши на русском, естественно, как человек, а не маркетолог.
— Избегай штампов: «индивидуальный подход», «премиум-качество», «лучшие на рынке», «команда профессионалов».
— Не используй эмодзи.
— Не выдумывай факты (точные сроки, бренды, цифры), если их нет в контексте.
— Учитывай что клиент мастера — обычный человек (физлицо), заказывающий потолок домой.
— Регион: Казахстан, городская аудитория.

ЗАДАЧА: сгенерировать ${n} разных варианта текста для поля "${spec.description}"

ПРАВИЛА для этого поля:
${spec.rules}${examples}

ОТВЕТ строго в JSON-формате:
{
  "suggestions": [
    { "text": "вариант 1" },
    { "text": "вариант 2" },
    { "text": "вариант 3" }
  ]
}`;
}

function buildUserPrompt({
  spec,
  context,
}: {
  spec: FieldSpec;
  context: CopyContext;
}): string {
  const lines: string[] = ["Контекст для генерации:"];
  if (context.companyName) lines.push(`— Название компании: ${context.companyName}`);
  if (context.ownerName) lines.push(`— Мастер: ${context.ownerName}`);
  if (context.city) lines.push(`— Город: ${context.city}`);
  if (context.client?.name) lines.push(`— Имя клиента: ${context.client.name}`);
  if (context.client?.address) lines.push(`— Адрес клиента: ${context.client.address}`);
  if (context.client?.area)
    lines.push(`— Площадь: ${context.client.area.toFixed(1)} м²`);
  if (context.client?.rooms) lines.push(`— Кол-во помещений: ${context.client.rooms}`);
  if (context.item?.kind)
    lines.push(`— Контекст пункта: ${context.item.kind}`);
  if (context.item?.position)
    lines.push(`— Позиция в блоке: ${context.item.position}`);
  if (context.question)
    lines.push(`— Вопрос FAQ, на который нужно ответить: «${context.question}»`);
  if (context.currentValue?.trim())
    lines.push(
      `\nТекущий текст мастера (улучши/перепиши в духе той же мысли, не дублируй):\n«${context.currentValue.trim()}»`
    );

  lines.push("\nСгенерируй варианты сейчас.");
  return lines.join("\n");
}
