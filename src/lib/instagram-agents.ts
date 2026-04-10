// Instagram Auto-Posting — 5 AI Agents Pipeline
// Architecture:
//   1. Image Analyzer (vision) — identifies room, ceiling type, colors, quality
//   2. Content Strategist — decides post type, photo order, narrative
//   3. Copywriter — writes caption + hashtags in Russian
//   4. Visual Editor — suggests crops, cover, ordering
//   5. Scheduler — determines optimal posting time
//
// Agents 1 & 5 run in parallel, then 2→3→4 sequentially

import { getOpenRouter, VISION_MODEL } from "@/lib/openrouter";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

export interface PhotoAnalysis {
  index: number;
  room_type: string;
  ceiling_type: string;
  lighting: string;
  colors: string;
  special_elements: string[];
  quality: "отлично" | "хорошо" | "средне" | "плохо";
  is_before: boolean;
  estimated_area_m2: number;
  description_ru: string;
  mood: string;
}

export interface AnalyzerResult {
  photos: PhotoAnalysis[];
  has_before_after: boolean;
  overall_quality: string;
  project_summary: string;
}

export interface StrategyResult {
  post_type: "before_after" | "showcase" | "process" | "tips";
  narrative: string;
  photo_order: number[];
  cover_index: number;
  cta_type: string;
  key_selling_points: string[];
  slide_captions: string[];
  emotional_hook: string;
}

export interface CopywriterResult {
  caption: string;
  hashtags: string;
  first_comment: string;
  alt_caption: string;
}

export interface VisualEditorResult {
  recommendations: Array<{
    index: number;
    aspect_ratio: string;
    crop_needed: boolean;
    brightness_ok: boolean;
    notes: string;
  }>;
  final_order: number[];
  cover_index: number;
  visual_score: number;
}

export interface SchedulerResult {
  recommended_datetime: string;
  reason: string;
  alternative_datetime: string;
  day_of_week: string;
}

export interface InstagramPipelineResult {
  analysis: AnalyzerResult;
  strategy: StrategyResult;
  copy: CopywriterResult;
  visual: VisualEditorResult;
  schedule: SchedulerResult;
}

// ─────────────────────────────────────────────────────
// Agent 1: Image Analyzer (Vision)
// ─────────────────────────────────────────────────────

const ANALYZER_PROMPT = `Ты — эксперт по фотографиям натяжных потолков с 10-летним опытом в SMM для строительных компаний. Проанализируй каждое фото максимально детально.

## Для каждого фото определи:
1. **Тип помещения** — гостиная, спальня, кухня, коридор, ванная, детская, офис, кабинет, студия
2. **Тип потолка** — матовый, глянцевый, сатиновый, двухуровневый, парящий, с подсветкой, комбинированный, с фотопечатью
3. **Освещение** — точечные светильники, люстра, LED-лента, трековые, споты, парящая подсветка, световые линии, комбинированное
4. **Цветовая гамма** — цвета потолка, стен, как сочетаются
5. **Особые элементы** — ниши, карнизы, световые линии, фотопечать, многоуровневость, скрытый карниз
6. **Качество фото** — оценка для Instagram (свет, ракурс, чистота кадра)
7. **До или после?** — это фото ДО установки (голый бетон, старый потолок) или ПОСЛЕ (готовый результат)?
8. **Примерная площадь** — оценка по пропорциям
9. **Описание** — что увидит зритель в Instagram, что впечатляет
10. **Настроение** — уют, современность, роскошь, минимализм, простор

## Формат ответа — ТОЛЬКО JSON:
\`\`\`json
{
  "photos": [
    {
      "index": 0,
      "room_type": "гостиная",
      "ceiling_type": "двухуровневый матовый с парящей подсветкой",
      "lighting": "точечные + LED-лента по периметру + парящий эффект",
      "colors": "белый потолок, тёплая LED-подсветка, бежевые стены",
      "special_elements": ["парящий эффект", "скрытая LED-лента", "точечные светильники"],
      "quality": "отлично",
      "is_before": false,
      "estimated_area_m2": 22,
      "description_ru": "Роскошный двухуровневый потолок в просторной гостиной. Парящий эффект создаёт ощущение невесомости, а тёплая подсветка добавляет уюта",
      "mood": "уют и современность"
    }
  ],
  "has_before_after": true,
  "overall_quality": "отлично",
  "project_summary": "Комплексный монтаж в двухкомнатной квартире — гостиная и спальня с LED-подсветкой"
}
\`\`\``;

async function runAnalyzer(imageUrls: string[], userContext?: string): Promise<AnalyzerResult> {
  let userMessage = `Проанализируй ${imageUrls.length} фото натяжных потолков для Instagram поста. Дай детальный анализ каждого.`;
  if (userContext) {
    userMessage += `\n\nОписание от мастера: "${userContext}"`;
  }

  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: userMessage },
  ];

  for (const url of imageUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: ANALYZER_PROMPT },
      { role: "user", content },
    ],
    stream: false,
    max_tokens: 3000,
    temperature: 0.3,
  });

  const text = result.choices[0]?.message?.content?.trim() || "";
  return extractJson(text) as AnalyzerResult;
}

// ─────────────────────────────────────────────────────
// Agent 2: Content Strategist
// ─────────────────────────────────────────────────────

const STRATEGIST_PROMPT = `Ты — опытный SMM-стратег для мастеров натяжных потолков в Казахстане. Твоя задача — превратить фото работ в привлекательный, качественный контент.

## Ты знаешь что работает в Instagram для строительных компаний:
- До/после карусели — высокий engagement (ставь "после" первым — показывай результат)
- 3-5 слайдов — оптимально (больше — листают меньше)
- Первый слайд решает — он должен привлечь внимание качеством работы
- Истории трансформации (было обычно → стало красиво) вызывают интерес
- Детали крупным планом (подсветка, текстура) — для слайдов 3-5
- Процесс монтажа интересен мастерам, НЕ клиентам

## Определи на основе анализа фото:
1. **Тип поста** — что будет работать лучше всего для этих фото
2. **Порядок фото** — какую карусель собрать (индексы фото)
3. **Cover** — какое фото первым (самый красивый результат)
4. **Нарратив** — какую историю рассказать
5. **Эмоциональный хук** — чем заинтересовать в первом слайде (тепло, без агрессии)
6. **CTA** — деликатный призыв к действию

## Формат — ТОЛЬКО JSON:
\`\`\`json
{
  "post_type": "before_after",
  "narrative": "Преображение гостиной — от обычного побеленного потолка к современному двухуровневому с подсветкой",
  "photo_order": [2, 0, 1, 3],
  "cover_index": 2,
  "cta_type": "consultation",
  "key_selling_points": ["двухуровневый", "LED-подсветка", "22 м²", "за 1 день"],
  "slide_captions": ["Результат", "А вот так было", "Процесс монтажа", "Детали подсветки"],
  "emotional_hook": "Гостиная полностью преобразилась — стала светлее и просторнее"
}
\`\`\``;

async function runStrategist(analysis: AnalyzerResult): Promise<StrategyResult> {
  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: STRATEGIST_PROMPT },
      {
        role: "user",
        content: `Вот анализ ${analysis.photos.length} фото:\n\n${JSON.stringify(analysis, null, 2)}\n\nСоставь стратегию для Instagram поста.`,
      },
    ],
    stream: false,
    max_tokens: 1500,
    temperature: 0.5,
  });

  const text = result.choices[0]?.message?.content?.trim() || "";
  return extractJson(text) as StrategyResult;
}

// ─────────────────────────────────────────────────────
// Agent 3: Copywriter
// ─────────────────────────────────────────────────────

const COPYWRITER_PROMPT = `Ты — копирайтер с душой. Пишешь для Instagram мастера натяжных потолков в Казахстане.

## СТИЛЬ: Тёплый, профессиональный, искренний
- НЕ корпоративный стиль ("Наша компания рада предложить...")
- НЕ спам-стиль ("ТОЛЬКО СЕГОДНЯ! СКИДКА!", "ВОТ ТАК! 🔥🔥🔥")
- НЕ агрессивный маркетинг ("РЕЗУЛЬТАТ!", хвастовство, крикливые заголовки)
- ДА — спокойный, уверенный, с теплотой к своему делу
- Как мастер, который просто показывает красивую работу — ему не нужно кричать, работа говорит сама за себя

## СТРУКТУРА ПОСТА:
1. **Хук (1-я строка)** — заинтересовать, но без крика. Наблюдение, деталь, тёплая мысль
   Примеры хуков: "Люблю такие проекты — когда всё продумано до мелочей", "Эта гостиная стала заметно светлее и просторнее", "Вот за что я люблю свою работу"
2. **Тело (2-3 предложения)** — что сделали, какой эффект, площадь, особенности. Спокойно, по делу.
3. **Изюминка** — интересная деталь (LED-лента 15 метров, подсветка меняет цвет, монтаж за 4 часа)
4. **CTA** — деликатный, ненавязчивый. "Если хотите так же — напишите, расскажу подробнее" или "Подробности — в Direct"

## ПРАВИЛА:
- Русский язык, 100-180 слов
- Эмодзи: 2-3 штуки максимум, только уместные
- Абзацы через пустую строку (читаемость на телефоне!)
- Никаких цен (у каждого клиента свой расчёт)
- Упомяни город мастера

## ХЕШТЕГИ (отдельно):
- 20-25 штук
- Формула: 5 широких + 5 локальных + 5 нишевых + 5-10 средних
- Широкие: #ремонт #дизайнинтерьера #квартира #интерьер #дизайн
- Локальные: #Астана #астанаремонт #натяжныепотолкиАстана #ремонтАстана #потолкиАстана
- Нишевые: #натяжнойпотолок #натяжныепотолки #двухуровневыйпотолок #потолокспотсветкой
- Средние: #ремонтквартиры #потолок #LED #светодиоднаяподсветка

## Формат — ТОЛЬКО JSON:
\`\`\`json
{
  "caption": "Люблю когда потолок завершает интерьер — и это сразу видно\\n\\nДвухуровневый матовый потолок в гостиной, 22 м². Парящий эффект с тёплой LED-лентой по периметру — комната стала визуально просторнее и уютнее.\\n\\nМонтаж занял 5 часов. Хозяева довольны, а мне приятно смотреть на результат\\n\\n📍 Астана\\nЕсли хотите так же — напишите в Direct, расскажу подробнее",
  "hashtags": "#натяжныепотолки #Астана #ремонт #натяжнойпотолок #дизайнинтерьера ...",
  "first_comment": "Бесплатный замер и расчёт — напишите в Direct",
  "alt_caption": "Альтернативный вариант текста если первый не понравится..."
}
\`\`\``;

async function runCopywriter(
  analysis: AnalyzerResult,
  strategy: StrategyResult,
  userContext?: string
): Promise<CopywriterResult> {
  let userMessage = `Анализ фото:\n${JSON.stringify(analysis, null, 2)}\n\nСтратегия:\n${JSON.stringify(strategy, null, 2)}\n\nНапиши тёплый, качественный текст для Instagram.`;
  if (userContext) {
    userMessage += `\n\nДополнительная информация от мастера (ОБЯЗАТЕЛЬНО учти в тексте): "${userContext}"`;
  }

  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: COPYWRITER_PROMPT },
      {
        role: "user",
        content: userMessage,
      },
    ],
    stream: false,
    max_tokens: 2000,
    temperature: 0.7,
  });

  const text = result.choices[0]?.message?.content?.trim() || "";
  return extractJson(text) as CopywriterResult;
}

// ─────────────────────────────────────────────────────
// Agent 4: Visual Editor
// ─────────────────────────────────────────────────────

const VISUAL_EDITOR_PROMPT = `Ты — визуальный редактор для Instagram с опытом в интерьерной фотографии.

## Твоя задача — оценить и улучшить визуальную подачу:

1. **Аспект** — какой формат лучше для каждого фото:
   - 4:5 (портрет) — лучше для ленты, занимает больше экрана
   - 1:1 (квадрат) — универсально
   - Карусель должна быть в ОДНОМ формате

2. **Кроп** — нужна ли обрезка:
   - Строительный мусор по краям? Обрезать!
   - Много пустого пространства? Обрезать!
   - Главный объект не в центре? Скорректировать!

3. **Яркость/Цвет** — фото должны выглядеть привлекательно:
   - Тёмные фото в Instagram = мало лайков
   - Жёлтый свет выглядит хуже белого на фото
   - Контраст должен быть достаточным

4. **Порядок** — подтверди или скорректируй порядок от стратега
5. **Cover** — первый слайд = самый яркий и чистый результат

## Формат — ТОЛЬКО JSON:
\`\`\`json
{
  "recommendations": [
    {
      "index": 0,
      "aspect_ratio": "4:5",
      "crop_needed": false,
      "brightness_ok": true,
      "notes": "Отличный ракурс, хороший свет"
    }
  ],
  "final_order": [2, 0, 1, 3],
  "cover_index": 2,
  "visual_score": 8
}
\`\`\``;

async function runVisualEditor(
  analysis: AnalyzerResult,
  strategy: StrategyResult
): Promise<VisualEditorResult> {
  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: VISUAL_EDITOR_PROMPT },
      {
        role: "user",
        content: `Анализ фото:\n${JSON.stringify(analysis, null, 2)}\n\nСтратегия (порядок фото):\n${JSON.stringify(strategy, null, 2)}\n\nОцени визуал и дай рекомендации.`,
      },
    ],
    stream: false,
    max_tokens: 1200,
    temperature: 0.3,
  });

  const text = result.choices[0]?.message?.content?.trim() || "";
  return extractJson(text) as VisualEditorResult;
}

// ─────────────────────────────────────────────────────
// Agent 5: Scheduler
// ─────────────────────────────────────────────────────

const SCHEDULER_PROMPT = `Ты — аналитик оптимального времени постинга в Instagram. Аудитория: Астана, Казахстан (UTC+6).

## Данные по best practices для строительной ниши:
- **Лучшие часы**: 07:00-09:00, 12:00-13:00, 18:00-20:00 по Астане
- **Лучшие дни**: вторник, среда, четверг — пик деловой активности
- **Понедельник утро** — хорошо (люди планируют неделю, думают о ремонте)
- **Суббота утро** — хорошо (выходной, люди думают о доме)
- **Воскресенье вечер** — неплохо (подготовка к неделе)
- **Пятница вечер** — плохо (люди отдыхают, не думают о ремонте)

## Правила:
- Не ставь пост на сегодня если уже поздно (после 21:00)
- Не постить два дня подряд (оптимально: через день)
- 3-4 поста в неделю максимум
- Учитывай историю постов (если предоставлена)

## Формат — ТОЛЬКО JSON:
\`\`\`json
{
  "recommended_datetime": "2026-04-08T07:00:00+06:00",
  "reason": "Вторник утро — пик активности аудитории, прошло 2 дня с последнего поста",
  "alternative_datetime": "2026-04-08T18:30:00+06:00",
  "day_of_week": "вторник"
}
\`\`\``;

async function runScheduler(recentPosts: string[]): Promise<SchedulerResult> {
  const now = new Date();
  const astanaTime = now.toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });

  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: SCHEDULER_PROMPT },
      {
        role: "user",
        content: `Сейчас: ${astanaTime} (Астана, UTC+6)\nISO: ${now.toISOString()}\n\nПоследние посты:\n${recentPosts.length > 0 ? recentPosts.join("\n") : "Постов ещё не было"}\n\nКогда лучше опубликовать следующий пост?`,
      },
    ],
    stream: false,
    max_tokens: 500,
    temperature: 0.3,
  });

  const text = result.choices[0]?.message?.content?.trim() || "";
  return extractJson(text) as SchedulerResult;
}

// ─────────────────────────────────────────────────────
// JSON extraction helper (same pattern as vision-agents.ts)
// ─────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlock) return JSON.parse(jsonBlock[1]);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error("No JSON found in agent response");
}

// ─────────────────────────────────────────────────────
// Main: Run full 5-agent pipeline
// ─────────────────────────────────────────────────────

export async function runInstagramPipeline(
  imageBase64Urls: string[],
  recentPostDates: string[] = [],
  userContext?: string
): Promise<InstagramPipelineResult> {
  console.log(`[Instagram Pipeline] Starting with ${imageBase64Urls.length} photos${userContext ? `, context: "${userContext.substring(0, 50)}..."` : ""}`);

  // Phase 1: Run Analyzer (vision) and Scheduler in parallel
  const [analysis, schedule] = await Promise.all([
    runAnalyzer(imageBase64Urls, userContext),
    runScheduler(recentPostDates),
  ]);
  console.log(`[Instagram Pipeline] Analysis: ${analysis.photos.length} photos analyzed`);
  console.log(`[Instagram Pipeline] Schedule: ${schedule.recommended_datetime}`);

  // Phase 2: Strategist (needs analysis)
  const strategy = await runStrategist(analysis);
  console.log(`[Instagram Pipeline] Strategy: ${strategy.post_type}, cover=${strategy.cover_index}`);

  // Phase 3: Copywriter (needs analysis + strategy + user context)
  const copy = await runCopywriter(analysis, strategy, userContext);
  console.log(`[Instagram Pipeline] Copy: ${copy.caption.substring(0, 50)}...`);

  // Phase 4: Visual Editor (needs analysis + strategy)
  const visual = await runVisualEditor(analysis, strategy);
  console.log(`[Instagram Pipeline] Visual: score=${visual.visual_score}, order=${visual.final_order}`);

  return { analysis, strategy, copy, visual, schedule };
}
