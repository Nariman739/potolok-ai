// AI генерация логотипа: LLM-диалог собирает бриф → Recraft v3 рисует логотип.

import Replicate from "replicate";
import { put } from "@vercel/blob";
import { getOpenRouter, AI_MODEL } from "./openrouter";

export type LogoChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type LogoChatResult =
  | { ready: false; nextQuestion: string }
  | { ready: true; brief: LogoBrief; promptEnglish: string };

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
- "professional, clean, vector style, square format, white background"

Пример promptEnglish:
"Modern professional logo for 'White Home', a stretched ceiling installation company in Almaty. Conveys reliability and warmth. Color palette: deep navy blue and warm gold. Includes minimalist ceiling/home symbol mark. Clean vector style, balanced composition, square format, white background."`;

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

  const text = response.choices[0]?.message?.content?.trim() ?? "";
  let parsed: unknown;
  try {
    // Удаляем возможные markdown-обёртки ```json ... ```
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    // Если LLM вернул просто текст — считаем что это next question
    return { ready: false, nextQuestion: text || "Попробуй ещё раз" };
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
    };
  }

  return {
    ready: false,
    nextQuestion:
      typeof obj.nextQuestion === "string"
        ? obj.nextQuestion
        : "Расскажи ещё немного о компании",
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
  const output = (await replicate.run("recraft-ai/recraft-v3", {
    input: {
      prompt: promptEnglish,
      size: "1024x1024",
      style: "any",
    },
  })) as unknown;

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

  const timestamp = Date.now();
  const path = `logos/${masterId}/${timestamp}.png`;
  const blob = await put(path, buffer, {
    access: "public",
    contentType: "image/png",
  });

  return { url: blob.url, promptUsed: promptEnglish };
}
