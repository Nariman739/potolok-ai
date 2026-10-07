// AI генерация логотипа: LLM-диалог собирает бриф → Recraft v3 рисует логотип.

import Replicate from "replicate";
import { put } from "@vercel/blob";
import { getOpenRouter, AI_MODEL } from "./openrouter";
import { computeCostFromUsage } from "./ai-cost-cap";
import { normalizeLogo } from "./logo-image";

export type LogoChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type LogoChatResult = (
  | { ready: false; nextQuestion: string }
  | { ready: true; brief: LogoBrief; promptEnglish: string }
) & { __costUsd?: number };

export type LogoBrief = {
  companyName: string | null;
  city: string | null;
  feeling: string;
  colors: string;
  hasIconOrText: string;
  extra?: string;
};

const SYSTEM_PROMPT = `Ты — AI-помощник который помогает мастеру натяжных потолков в Казахстане составить бриф для логотипа. Задавай ОДИН наводящий вопрос за раз, мягко, на простом русском языке. Цель — за 3-5 коротких вопросов понять:
1. Чем компания гордится (1-2 предложения о бизнесе)
2. Какое чувство хочет передать клиентам (надёжность, премиум, современность, доступность, тепло, точность и т.п. — НЕ говори «минимализм», объясняй ассоциациями)
3. Какие цвета ближе по душе (тёмные/светлые, синий/чёрный/зелёный/что-то яркое)
4. Хочет знак-символ (иконка) или просто красивую надпись с названием
5. Опционально — какие-то особенные пожелания

Когда у тебя достаточно информации — ВЕРНИ JSON: { "ready": true, "brief": {...}, "promptEnglish": "..." }
Иначе — ВЕРНИ JSON: { "ready": false, "nextQuestion": "Текст следующего вопроса" }

ВАЖНО: отвечай ТОЛЬКО валидным JSON без markdown, без пояснений.

Поле promptEnglish — это финальный prompt для Recraft v3 на английском, описывающий нужный логотип. Должен включать:
- Название компании (если есть)
- Тип логотипа (logo design, brand mark)
- Стиль/feeling
- Цвета
- Символику если хочет иконку
- "professional, clean, flat vector logo artwork only, isolated on plain solid white background, no gradients, no shadows, no mockup, no photograph, no signboard, no interior scene"
  (без этого модель рисует вывеску на стене или фото комнаты вместо логотипа — так вышло у двух мастеров 05–07.10.2026)
- Если название компании кириллицей — напиши в promptEnglish, что текст логотипа должен быть ТОЧНО этим названием латиницей (транслитерация), короткий и крупный; если название длиннее 14 символов — проси только знак-символ без текста или сокращение, иначе модель исказит буквы

Пример promptEnglish:
"Modern professional logo for 'White Home', a stretched ceiling installation company in Almaty. Conveys reliability and warmth. Color palette: deep navy blue and warm gold. Includes minimalist ceiling/home symbol mark. Logo text exactly 'White Home', short and large. Clean flat vector logo artwork only, balanced composition, isolated on plain solid white background, no gradients, no shadows, no mockup, no photograph, no signboard, no interior scene."`;

export async function continueLogoChat(
  master: { firstName: string; companyName: string | null; address: string | null },
  history: LogoChatMessage[],
): Promise<LogoChatResult> {
  const client = getOpenRouter();

  const systemMsg = [
    SYSTEM_PROMPT,
    "",
    "Известно о мастере:",
    `- Имя: ${master.firstName}`,
    master.companyName ? `- Название компании: ${master.companyName}` : "- Название компании НЕ указано",
    master.address ? `- Город: ${master.address}` : "- Город НЕ указан",
    "",
    history.length === 0
      ? "Это начало диалога. Если название и город известны — НЕ переспрашивай их. Начни с вопроса о чувстве/настроении."
      : "Продолжай диалог. Помни ответы и не переспрашивай уже известное.",
  ].join("\n");

  const messages = [
    { role: "system" as const, content: systemMsg },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await client.chat.completions.create({
    model: AI_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 800,
  });
  const costUsd = computeCostFromUsage(response.usage, AI_MODEL);

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  let parsed: unknown;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return { ready: false, nextQuestion: text || "Попробуй ещё раз", __costUsd: costUsd };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.ready === true) {
    return {
      ready: true,
      brief: (obj.brief as LogoBrief) ?? {
        companyName: master.companyName,
        city: master.address,
        feeling: "",
        colors: "",
        hasIconOrText: "",
      },
      promptEnglish: typeof obj.promptEnglish === "string" ? obj.promptEnglish : "",
      __costUsd: costUsd,
    };
  }

  return {
    ready: false,
    nextQuestion:
      typeof obj.nextQuestion === "string"
        ? obj.nextQuestion
        : "Расскажи ещё немного о компании",
    __costUsd: costUsd,
  };
}

export async function generateLogo(
  promptEnglish: string,
  masterId: string,
): Promise<{ url: string; promptUsed: string }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN не настроен");
  }

  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Recraft v3 — отлично с текстом и логотипами
  // https://replicate.com/recraft-ai/recraft-v3
  // style vector_illustration вместо any (07.10.2026): с «any» модель рисовала
  // фото вывески на стене или комнату с логотипом — мастер получал мокап,
  // а не знак. Плоская векторная иллюстрация даёт то, что нужно для КП.
  const runRecraft = (style: string) =>
    replicate.run("recraft-ai/recraft-v3", {
      input: { prompt: promptEnglish, size: "1024x1024", style },
    }) as Promise<unknown>;
  let output: unknown;
  try {
    output = await runRecraft("vector_illustration");
  } catch (e) {
    // Если Replicate не принял стиль (сменили перечень) — не ломаем мастеру
    // генерацию, падаем обратно на «any».
    if (e instanceof Error && /style|enum|invalid/i.test(e.message)) output = await runRecraft("any");
    else throw e;
  }

  // Recraft v3 возвращает строку URL или массив строк, или Stream
  let imageUrl: string | null = null;
  if (typeof output === "string") {
    imageUrl = output;
  } else if (Array.isArray(output) && typeof output[0] === "string") {
    imageUrl = output[0];
  } else if (
    output &&
    typeof output === "object" &&
    "url" in output &&
    typeof (output as { url: unknown }).url === "function"
  ) {
    // ReadableStream-like
    const u = (output as { url: () => URL | string }).url();
    imageUrl = typeof u === "string" ? u : u.toString();
  } else if (output && typeof output === "object" && "url" in output) {
    const u = (output as { url: unknown }).url;
    imageUrl = typeof u === "string" ? u : null;
  }

  if (!imageUrl) {
    throw new Error("Replicate не вернул URL картинки");
  }

  // Качаем и заливаем в наш Vercel Blob (чтобы не зависеть от Replicate URL)
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Не удалось скачать сгенерированный логотип`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Recraft отдаёт WebP, а PDF КП умеет только PNG/JPG — до 07.10.2026 файл
  // лежал как .png с байтами WebP и в КП молча не печатался. Теперь настоящий
  // PNG, внешний белый фон прозрачный, поля срезаны (см. logo-image.ts).
  const { png } = await normalizeLogo(buffer);

  const timestamp = Date.now();
  const path = `logos/${masterId}/${timestamp}.png`;
  const blob = await put(path, png, {
    access: "public",
    contentType: "image/png",
  });

  return { url: blob.url, promptUsed: promptEnglish };
}
