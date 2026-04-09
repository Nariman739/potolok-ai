// Telegram Bot — AI assistant logic for PotolokAI
// Handles: text messages, photos (vision), voice messages (STT)

import { prisma } from "@/lib/prisma";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { buildSystemPrompt } from "@/lib/assistant-prompt";
import { calculate } from "@/lib/calculate";
import { DEFAULT_PRICES, KP_LIMITS } from "@/lib/constants";
import {
  sendTelegramMessage,
  sendTelegramMessageWithButtons,
  sendTypingAction,
  downloadTelegramFile,
} from "@/lib/telegram";
import { runVisionAgents, formatVisionResults } from "@/lib/vision-agents";
import {
  processInstagramPhotos,
  handleInstagramCallback,
} from "@/lib/instagram-publisher";
import type { ChatMessage, RoomInput, CalculationResult } from "@/lib/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

// ─────────────────────────────────────────────────────
// Main entry: process any Telegram message
// ─────────────────────────────────────────────────────
export async function handleTelegramBotMessage(
  chatId: string,
  text: string | null,
  photoFileId: string | null,
  voiceFileId: string | null
): Promise<void> {
  // Find master by chatId
  const master = await prisma.master.findUnique({
    where: { telegramChatId: chatId },
    select: {
      id: true,
      firstName: true,
      companyName: true,
    },
  });

  if (!master) {
    await sendTelegramMessage(
      chatId,
      "❌ Аккаунт не привязан.\n\nПерейдите в <b>Профиль → Telegram</b> на potolok.ai и нажмите «Привязать»."
    );
    return;
  }

  // Show typing indicator
  await sendTypingAction(chatId);

  // Handle voice → convert to text
  let messageText = text;
  if (voiceFileId && !messageText) {
    messageText = await transcribeVoice(voiceFileId);
    if (!messageText) {
      await sendTelegramMessage(chatId, "⚠️ Не удалось распознать голосовое сообщение. Попробуйте текстом.");
      return;
    }
  }

  // Handle photo → download and convert to base64 data URL
  // (Telegram URLs are temporary and may not be accessible by OpenRouter)
  let imageUrl: string | null = null;
  if (photoFileId) {
    const photoBuffer = await downloadTelegramFile(photoFileId);
    if (!photoBuffer) {
      await sendTelegramMessage(chatId, "⚠️ Не удалось загрузить фото. Попробуйте ещё раз.");
      return;
    }
    const base64 = Buffer.from(photoBuffer).toString("base64");
    imageUrl = `data:image/jpeg;base64,${base64}`;
  }

  if (!messageText && !imageUrl) {
    await sendTelegramMessage(chatId, "Отправьте фото замеров, текст или голосовое сообщение 📸");
    return;
  }

  // Process through AI
  try {
    // If photo → run multi-agent vision first, then conversation without photo
    let visionContext: string | null = null;
    if (imageUrl) {
      try {
        const visionResult = await runVisionAgents(imageUrl);
        visionContext = formatVisionResults(visionResult);
        console.log("[Multi-agent] Vision context:", visionContext);
      } catch (visionErr) {
        console.error("Vision agents error:", visionErr);
        // Fall back to single-agent with photo
      }
    }

    const result = await processAIChat(
      master.id,
      master.companyName || master.firstName,
      messageText,
      visionContext ? null : imageUrl, // No photo if vision agents succeeded
      visionContext
    );
    await sendTelegramMessage(chatId, result.response);

    // If client_data was extracted and we have a calculation → auto-create КП
    if (result.clientData && result.calculationResult && result.extractedRooms) {
      await createEstimateFromBot(
        chatId,
        master.id,
        result.extractedRooms,
        result.calculationResult,
        result.clientData,
        result.sessionId
      );
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Telegram bot AI error:", errMsg);
    await sendTelegramMessage(chatId, `⚠️ Произошла ошибка. Попробуйте /new и отправьте фото ещё раз.`);
  }
}

// ─────────────────────────────────────────────────────
// AI Chat — same logic as web assistant but non-streaming
// ─────────────────────────────────────────────────────
interface AIResult {
  response: string;
  extractedRooms: RoomInput[] | null;
  calculationResult: CalculationResult | null;
  clientData: { name?: string; phone?: string; address?: string } | null;
  sessionId: string;
}

async function processAIChat(
  masterId: string,
  masterName: string,
  message: string | null,
  imageUrl: string | null,
  visionContext: string | null = null
): Promise<AIResult> {
  // Load master prices
  const masterPrices = await prisma.masterPrice.findMany({
    where: { masterId },
  });
  const prices: Record<string, number> = { ...DEFAULT_PRICES };
  for (const mp of masterPrices) {
    prices[mp.itemCode] = mp.price;
  }

  // Get or create active Telegram chat session
  let chatSession = await prisma.chatSession.findFirst({
    where: { masterId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (!chatSession) {
    chatSession = await prisma.chatSession.create({
      data: { masterId },
    });
  }

  const existingMessages = (chatSession.messages ?? []) as unknown as ChatMessage[];

  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message || "Отправлено фото",
    imageUrl: imageUrl ?? undefined,
    timestamp: new Date().toISOString(),
  };

  const allMessages = [...existingMessages, userMsg];

  const photoUrls = [...(chatSession.photoUrls || [])];
  if (imageUrl) photoUrls.push(imageUrl);

  // Skip separate vision extraction — pass photo directly to conversation AI
  // This saves ~8 seconds (critical for Vercel Hobby 10s limit)
  const systemPrompt = buildSystemPrompt(masterName, prices);

  // Build OpenAI messages — limit to last 6 messages to stay within timeout
  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  const recentMessages = allMessages.length > 6
    ? allMessages.slice(-6)
    : allMessages;

  for (let i = 0; i < recentMessages.length; i++) {
    const msg = recentMessages[i];
    const isCurrentMsg = i === recentMessages.length - 1;

    if (msg.role === "user") {
      if (isCurrentMsg && visionContext) {
        // Multi-agent: pass structured vision data instead of photo (saves tokens!)
        openaiMessages.push({
          role: "user",
          content: `${message || "Посчитай по фото замеров"}\n\n--- РЕЗУЛЬТАТ АНАЛИЗА ФОТО ---\n${visionContext}`,
        });
      } else if (isCurrentMsg && imageUrl) {
        // Fallback: send photo directly to conversation AI
        openaiMessages.push({
          role: "user",
          content: [
            { type: "text", text: message || "Посчитай по этому фото замеров" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        });
      } else {
        openaiMessages.push({ role: "user", content: msg.content });
      }
    } else {
      openaiMessages.push({ role: "assistant", content: msg.content });
    }
  }

  // Non-streaming AI call
  // When vision context is provided, conversation agent needs fewer tokens
  const result = await getOpenRouter().chat.completions.create({
    model: AI_MODEL,
    messages: openaiMessages,
    stream: false,
    max_tokens: visionContext ? 1200 : 2000,
  });

  const fullContent = result.choices[0]?.message?.content?.trim() || "Нет ответа от AI";

  // Parse room_data and calculate
  const roomDataMatch = fullContent.match(/```room_data\s*\n([\s\S]*?)\n```/);
  let extractedRooms: RoomInput[] | null = null;
  let calculationResult = null;

  if (roomDataMatch) {
    try {
      const rawRooms = JSON.parse(roomDataMatch[1]);
      extractedRooms = rawRooms.map((r: Record<string, unknown>) => {
        const area = Math.round((Number(r.area) || 0) * 100) / 100;
        let length = Math.round((Number(r.length) || 0) * 100) / 100;
        let width = Math.round((Number(r.width) || 0) * 100) / 100;

        if (area > 0 && (length === 0 || width === 0)) {
          // Estimate dimensions from area, keeping length * width = area exactly
          const ratio = 1.3;
          width = Math.round(Math.sqrt(area / ratio) * 100) / 100;
          length = Math.round((area / width) * 100) / 100;
        }

        return {
          id: crypto.randomUUID(),
          name: r.name || "Комната",
          length,
          width,
          ceilingHeight: Number(r.ceilingHeight) || 3,
          canvasType: (r.canvasType as string) || "mat",
          spotsCount: Number(r.spotsCount) || 0,
          chandelierCount: Number(r.chandelierCount) || 0,
          trackMagneticLength: 0,
          lightLineLength: 0,
          curtainRodLength: Number(r.curtainRodLength) || 0,
          pipeBypasses: Number(r.pipeBypasses) || 0,
          cornersCount: Number(r.cornersCount) || 4,
          eurobrusCount: 0,
          shape: (r.shape as string) || undefined,
          lShapeDims: r.lShapeDims || undefined,
          tShapeDims: r.tShapeDims || undefined,
        };
      });

      calculationResult = calculate(extractedRooms!, prices);
    } catch (e) {
      console.error("Failed to parse room_data in Telegram bot:", e);
    }
  }

  // Save to DB
  const assistantMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: fullContent,
    timestamp: new Date().toISOString(),
    calculationResult: calculationResult ?? undefined,
  };

  const updatedMessages = [...allMessages, assistantMsg];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    messages: JSON.parse(JSON.stringify(updatedMessages)),
    photoUrls,
  };
  if (extractedRooms) {
    updateData.extractedRooms = JSON.parse(JSON.stringify(extractedRooms));
  }
  if (calculationResult) {
    updateData.calculationData = JSON.parse(JSON.stringify(calculationResult));
  }

  await prisma.chatSession.update({
    where: { id: chatSession.id },
    data: updateData,
  });

  // Parse client_data block if present
  const clientDataMatch = fullContent.match(/```client_data\s*\n([\s\S]*?)\n```/);
  let clientData: { name?: string; phone?: string; address?: string } | null = null;
  if (clientDataMatch) {
    try {
      clientData = JSON.parse(clientDataMatch[1]);
    } catch (e) {
      console.error("Failed to parse client_data:", e);
    }
  }

  // Format response for Telegram
  let telegramResponse = cleanMarkdownForTelegram(fullContent);

  // Append calculation summary if available
  if (calculationResult) {
    telegramResponse = appendCalculationSummary(telegramResponse, calculationResult);
  }

  return {
    response: telegramResponse,
    extractedRooms,
    calculationResult,
    clientData,
    sessionId: chatSession.id,
  };
}

// ─────────────────────────────────────────────────────
// Voice → Text (STT via Groq Whisper)
// ─────────────────────────────────────────────────────
async function transcribeVoice(fileId: string): Promise<string | null> {
  const audioBuffer = await downloadTelegramFile(fileId);
  if (!audioBuffer) return null;

  // Use Groq's Whisper API (free, fast, OpenAI-compatible)
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.error("GROQ_API_KEY not set — voice messages disabled");
    return null;
  }

  try {
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(audioBuffer)]), "voice.ogg");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "ru");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (!res.ok) {
      console.error("Groq STT error:", res.status);
      return null;
    }

    const data = await res.json();
    return data.text || null;
  } catch (e) {
    console.error("Voice transcription failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────

/** Clean AI markdown for Telegram HTML */
function cleanMarkdownForTelegram(text: string): string {
  // Remove ```room_data and ```client_data blocks (internal, not for user)
  let cleaned = text
    .replace(/```room_data\s*\n[\s\S]*?\n```/g, "")
    .replace(/```client_data\s*\n[\s\S]*?\n```/g, "")
    .trim();

  // Convert markdown bold **text** to HTML <b>text</b>
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

  // Convert markdown italic *text* to HTML <i>text</i>
  cleaned = cleaned.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");

  // Remove remaining markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`([^`]+)`/g, "<code>$1</code>");

  return cleaned;
}

/** Append calculation summary in readable format */
function appendCalculationSummary(
  text: string,
  calc: { total: number; totalArea: number; pricePerM2: number; roomResults: Array<{ roomName: string; area: number; subtotalAfterHeight: number }> }
): string {
  const lines = ["\n\n📊 <b>Расчёт:</b>"];

  for (const room of calc.roomResults) {
    const area = Math.round(room.area * 100) / 100;
    lines.push(`• ${room.roomName}: ${area} м² — ${room.subtotalAfterHeight.toLocaleString("ru")} ₸`);
  }

  lines.push("");
  lines.push(`<b>Итого: ${calc.total.toLocaleString("ru")} ₸</b>`);
  const totalArea = Math.round(calc.totalArea * 100) / 100;
  lines.push(`Площадь: ${totalArea} м² | ${calc.pricePerM2.toLocaleString("ru")} ₸/м²`);

  return text + lines.join("\n");
}

// ─────────────────────────────────────────────────────
// Auto-create КП from bot conversation
// ─────────────────────────────────────────────────────
async function createEstimateFromBot(
  chatId: string,
  masterId: string,
  rooms: RoomInput[],
  calcResult: CalculationResult,
  clientData: { name?: string; phone?: string; address?: string },
  sessionId: string
): Promise<void> {
  try {
    // Check KP limit
    const master = await prisma.master.findUnique({
      where: { id: masterId },
      select: { subscriptionTier: true, kpGeneratedThisMonth: true },
    });

    if (!master) return;

    const limit = KP_LIMITS[master.subscriptionTier as keyof typeof KP_LIMITS];
    if (master.kpGeneratedThisMonth >= limit) {
      await sendTelegramMessage(
        chatId,
        `⚠️ Лимит КП исчерпан (${limit}/мес).\n\nПерейдите на PRO для безлимита на potolok.ai`
      );
      return;
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);

    const estimate = await prisma.estimate.create({
      data: {
        masterId,
        roomsData: JSON.parse(JSON.stringify(rooms)),
        calculationData: JSON.parse(JSON.stringify(calcResult)),
        totalArea: calcResult.totalArea,
        total: calcResult.total,
        clientName: clientData.name || null,
        clientPhone: clientData.phone || null,
        clientAddress: clientData.address || null,
        validUntil,
      },
    });

    // Link chat session to estimate
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { estimateId: estimate.id },
    });

    // Increment KP counter
    await prisma.master.update({
      where: { id: masterId },
      data: { kpGeneratedThisMonth: { increment: 1 } },
    });

    // Send КП link to master
    const kpUrl = `https://potolok.ai/kp/${estimate.publicId}`;
    await sendTelegramMessage(
      chatId,
      `✅ <b>КП создано!</b>\n\n` +
      `👤 ${clientData.name || "Клиент"}\n` +
      `💰 ${calcResult.total.toLocaleString("ru")} ₸\n` +
      `📐 ${calcResult.totalArea.toFixed(1)} м²\n\n` +
      `🔗 Ссылка для клиента:\n${kpUrl}\n\n` +
      `Отправьте эту ссылку клиенту в WhatsApp 👆\n` +
      `PDF можно скачать на сайте в разделе "Расчёты".`
    );
  } catch (error) {
    console.error("Failed to create estimate from bot:", error);
    await sendTelegramMessage(chatId, "⚠️ Расчёт готов, но КП не удалось сохранить. Попробуйте создать на сайте.");
  }
}

// ─────────────────────────────────────────────────────
// Instagram /post — Photo collection state
// ─────────────────────────────────────────────────────

// Media item: photo or video
interface PendingMedia {
  buffer: Buffer;
  type: "photo" | "video";
  base64Url?: string; // only for photos (vision analysis)
}

// In-memory store for collecting media per chat
const pendingInstagramMedia = new Map<
  string,
  {
    media: PendingMedia[];
    masterId: string;
    userContext: string;
    timer: ReturnType<typeof setTimeout> | null;
  }
>();

// Track which chats are in "waiting for photos" mode
const instagramPostMode = new Set<string>();

// No debounce — user presses "Готово" button when done

/** Handle /post command — enter photo collection mode */
export async function handleInstagramPostCommand(
  chatId: string,
  masterId: string
): Promise<void> {
  const account = await prisma.instagramAccount.findUnique({
    where: { masterId },
  });

  if (!account) {
    await sendTelegramMessage(
      chatId,
      "❌ Instagram аккаунт не подключён.\n\nОбратитесь к администратору для настройки."
    );
    return;
  }

  instagramPostMode.add(chatId);
  pendingInstagramMedia.delete(chatId);

  await sendTelegramMessageWithButtons(
    chatId,
    `📸 <b>Режим Instagram-поста</b>\n\n` +
    `Отправьте <b>фото и/или видео</b> натяжного потолка (1-10 шт).\n` +
    `Можно по одному или группой.\n\n` +
    `💡 <b>Совет для качества:</b> Отправляйте фото как <b>файл</b> (📎 скрепка → Файл), а не как фото — так качество не теряется!\n` +
    `📹 Видео — до 20 МБ.\n\n` +
    `🎤 Можете <b>наговорить голосом</b> или <b>написать текстом</b> описание работы — AI использует это для поста.\n\n` +
    `Когда всё отправите — нажмите <b>Готово</b> 👇`,
    [[{ text: "✅ Готово — запустить AI", callback_data: "ig_ready" }],
     [{ text: "❌ Отмена", callback_data: "ig_cancel" }]]
  );
}

/** Handle incoming photo when in Instagram post mode */
export async function handleInstagramPhoto(
  chatId: string,
  masterId: string,
  photoFileId: string
): Promise<boolean> {
  if (!instagramPostMode.has(chatId)) return false;

  const photoBuffer = await downloadTelegramFile(photoFileId);
  if (!photoBuffer) {
    await sendTelegramMessage(chatId, "⚠️ Не удалось загрузить фото. Попробуйте ещё раз.");
    return true;
  }

  const base64 = Buffer.from(photoBuffer).toString("base64");
  const base64Url = `data:image/jpeg;base64,${base64}`;

  const pending = getOrCreatePending(chatId, masterId);
  pending.media.push({ buffer: photoBuffer, type: "photo", base64Url });

  const n = pending.media.length;
  if (n === 1 || n % 3 === 0) {
    await sendTelegramMessage(chatId, `📷 ${n} медиа принято.`);
  }

  return true;
}

/** Handle incoming video when in Instagram post mode */
export async function handleInstagramVideo(
  chatId: string,
  masterId: string,
  videoFileId: string
): Promise<boolean> {
  if (!instagramPostMode.has(chatId)) return false;

  await sendTelegramMessage(chatId, `🎬 Загружаю видео...`);

  const videoBuffer = await downloadTelegramFile(videoFileId);
  if (!videoBuffer) {
    console.error(`[Instagram Video] Failed to download video file_id=${videoFileId} — likely exceeds 20MB Telegram Bot API limit`);
    await sendTelegramMessage(
      chatId,
      "⚠️ Не удалось загрузить видео.\n\n" +
      "Telegram ограничивает размер файла для ботов (до 20 МБ).\n" +
      "💡 <b>Совет:</b> Отправьте видео покороче или сожмите перед отправкой."
    );
    return true;
  }

  const sizeMb = (videoBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`[Instagram Video] Downloaded video: ${sizeMb} MB`);

  const pending = getOrCreatePending(chatId, masterId);
  pending.media.push({ buffer: videoBuffer, type: "video" });

  const n = pending.media.length;
  await sendTelegramMessage(chatId, `🎬 Видео принято (${sizeMb} МБ, ${n} медиа всего).`);

  return true;
}

// Words that trigger "Готово" (start processing)
const READY_WORDS = new Set([
  "ок", "ok", "го", "go", "готово", "давай", "да", "поехали",
  "запускай", "старт", "start", "жми", "делай", "вперёд", "вперед",
]);

/** Handle text message in Instagram post mode (user description or "ready" trigger) */
export async function handleInstagramText(
  chatId: string,
  masterId: string,
  text: string
): Promise<boolean> {
  if (!instagramPostMode.has(chatId)) return false;

  // Check if text is a "ready" trigger — start processing
  const normalized = text.toLowerCase().trim().replace(/[!.,?]+$/, "");
  if (READY_WORDS.has(normalized)) {
    const pending = pendingInstagramMedia.get(chatId);
    if (pending && pending.media.length > 0) {
      await processCollectedPhotos(chatId);
      return true;
    }
    // No media yet — tell user to send photos first
    await sendTelegramMessage(chatId, "📸 Сначала отправьте фото или видео, потом нажмите <b>Готово</b>.");
    return true;
  }

  const pending = getOrCreatePending(chatId, masterId);
  pending.userContext += (pending.userContext ? "\n" : "") + text;

  await sendTelegramMessage(chatId, `✏️ Описание принято. Когда всё — нажмите <b>Готово</b> или напишите "ок".`);

  return true;
}

/** Handle voice message in Instagram post mode */
export async function handleInstagramVoice(
  chatId: string,
  masterId: string,
  voiceFileId: string
): Promise<boolean> {
  if (!instagramPostMode.has(chatId)) return false;

  await sendTelegramMessage(chatId, `🎤 Распознаю голос...`);

  const transcribed = await transcribeVoice(voiceFileId);
  if (!transcribed) {
    await sendTelegramMessage(chatId, "⚠️ Не удалось распознать. Попробуйте текстом.");
    return true;
  }

  const pending = getOrCreatePending(chatId, masterId);
  pending.userContext += (pending.userContext ? "\n" : "") + transcribed;

  await sendTelegramMessage(chatId, `🎤 Распознано: "${transcribed.substring(0, 100)}${transcribed.length > 100 ? "..." : ""}"`);

  return true;
}

/** Get or create pending state */
function getOrCreatePending(chatId: string, masterId: string) {
  let pending = pendingInstagramMedia.get(chatId);
  if (!pending) {
    pending = { media: [], masterId, userContext: "", timer: null };
    pendingInstagramMedia.set(chatId, pending);
  }
  return pending;
}

/** Process all collected media through the Instagram pipeline */
async function processCollectedPhotos(chatId: string): Promise<void> {
  const pending = pendingInstagramMedia.get(chatId);
  if (!pending || pending.media.length === 0) {
    if (pending?.userContext) {
      instagramPostMode.delete(chatId);
      pendingInstagramMedia.delete(chatId);
      await sendTelegramMessage(chatId, "⚠️ Нужно хотя бы 1 фото или видео. Попробуйте /post ещё раз.");
    }
    return;
  }

  // Clean up state
  instagramPostMode.delete(chatId);
  pendingInstagramMedia.delete(chatId);

  const photoCount = pending.media.filter(m => m.type === "photo").length;
  const videoCount = pending.media.filter(m => m.type === "video").length;
  const contextMsg = pending.userContext ? `\n📝 Ваше описание учтено!` : "";

  const mediaSummary = [
    photoCount > 0 ? `${photoCount} фото` : "",
    videoCount > 0 ? `${videoCount} видео` : "",
  ].filter(Boolean).join(" + ");

  await sendTelegramMessage(
    chatId,
    `🤖 Обрабатываю ${mediaSummary}...${contextMsg}\n\n` +
    `5 AI-агентов работают:\n` +
    `1️⃣ Анализатор фото\n` +
    `2️⃣ SMM-стратег\n` +
    `3️⃣ Копирайтер\n` +
    `4️⃣ Визуальный редактор\n` +
    `5️⃣ Планировщик\n\n` +
    `Это займёт ~20 секунд...`
  );

  await sendTypingAction(chatId);

  try {
    // Separate photos and videos, upload all to Blob
    const photoBase64Urls: string[] = [];
    const blobUrls: string[] = [];
    const mediaTypes: ("photo" | "video")[] = [];

    for (const item of pending.media) {
      const timestamp = Date.now();
      const ext = item.type === "video" ? "mp4" : "jpg";
      const contentType = item.type === "video" ? "video/mp4" : "image/jpeg";
      const path = `instagram/${pending.masterId}/${timestamp}-${blobUrls.length}.${ext}`;

      const { put } = await import("@vercel/blob");
      const blob = await put(path, item.buffer, { access: "public", contentType });
      blobUrls.push(blob.url);
      mediaTypes.push(item.type);

      if (item.type === "photo" && item.base64Url) {
        photoBase64Urls.push(item.base64Url);
      }
    }

    await processInstagramPhotos(
      pending.masterId,
      chatId,
      photoBase64Urls,
      blobUrls,
      pending.userContext || undefined,
      mediaTypes
    );
  } catch (error) {
    console.error("[Instagram /post] Error:", error);
    await sendTelegramMessage(
      chatId,
      "⚠️ Произошла ошибка при обработке. Попробуйте /post ещё раз."
    );
  }
}

/** Handle callback query from Instagram inline buttons */
export async function handleInstagramCallbackQuery(
  chatId: string,
  callbackData: string
): Promise<boolean> {
  if (!callbackData.startsWith("ig_")) return false;

  // Handle "Готово" button — start processing
  if (callbackData === "ig_ready") {
    if (isInInstagramPostMode(chatId)) {
      await processCollectedPhotos(chatId);
    } else {
      await sendTelegramMessage(chatId, "Нет активного сбора фото. Используйте /post");
    }
    return true;
  }

  // Handle "Отмена" button during collection
  if (callbackData === "ig_cancel") {
    cancelInstagramPostMode(chatId);
    await sendTelegramMessage(chatId, "❌ Instagram-пост отменён.");
    return true;
  }

  // Format: ig_action:postId
  const colonIdx = callbackData.indexOf(":");
  if (colonIdx === -1) return false;

  const action = callbackData.substring(0, colonIdx);
  const postId = callbackData.substring(colonIdx + 1);

  await handleInstagramCallback(chatId, action, postId);
  return true;
}

/** Check if chat is in Instagram post mode */
export function isInInstagramPostMode(chatId: string): boolean {
  return instagramPostMode.has(chatId);
}

/** Cancel Instagram post mode */
export function cancelInstagramPostMode(chatId: string): void {
  const pending = pendingInstagramMedia.get(chatId);
  if (pending?.timer) clearTimeout(pending.timer);
  instagramPostMode.delete(chatId);
  pendingInstagramMedia.delete(chatId);
}

// ─────────────────────────────────────────────────────
// Bot commands
// ─────────────────────────────────────────────────────
export async function handleBotCommand(
  chatId: string,
  command: string,
  masterId: string
): Promise<void> {
  switch (command) {
    case "/new":
    case "/reset": {
      // Close current session, start fresh
      await prisma.chatSession.updateMany({
        where: { masterId, status: "ACTIVE" },
        data: { status: "COMPLETED" },
      });
      await sendTelegramMessage(chatId, "🔄 Новый расчёт начат.\n\nОтправьте фото замеров или напишите размеры комнат.");
      break;
    }

    case "/list":
    case "/kp": {
      // List recent estimates
      const estimates = await prisma.estimate.findMany({
        where: { masterId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          publicId: true,
          clientName: true,
          total: true,
          totalArea: true,
          status: true,
          createdAt: true,
        },
      });

      if (estimates.length === 0) {
        await sendTelegramMessage(chatId, "📋 У вас пока нет КП.\n\nОтправьте фото замеров чтобы начать расчёт.");
        return;
      }

      const statusEmoji: Record<string, string> = {
        DRAFT: "📝",
        SENT: "📤",
        VIEWED: "👀",
        CONFIRMED: "✅",
        REJECTED: "❌",
        REVISED: "🔄",
      };

      const lines = ["📋 <b>Последние КП:</b>\n"];
      for (const est of estimates) {
        const emoji = statusEmoji[est.status] || "📄";
        const date = est.createdAt.toLocaleDateString("ru");
        const client = est.clientName || "Без имени";
        const total = est.total.toLocaleString("ru");
        lines.push(`${emoji} ${client} — ${total} ₸ (${date})`);
        lines.push(`   🔗 potolok.ai/kp/${est.publicId}\n`);
      }

      await sendTelegramMessage(chatId, lines.join("\n"));
      break;
    }

    case "/post": {
      await handleInstagramPostCommand(chatId, masterId);
      break;
    }

    case "/cancel": {
      if (isInInstagramPostMode(chatId)) {
        cancelInstagramPostMode(chatId);
        await sendTelegramMessage(chatId, "❌ Instagram-пост отменён.");
      } else {
        await sendTelegramMessage(chatId, "Нечего отменять.");
      }
      break;
    }

    case "/help": {
      await sendTelegramMessage(
        chatId,
        `🤖 <b>PotolokAI Бот</b>\n\n` +
        `📸 <b>Фото</b> — отправьте фото замеров для расчёта\n` +
        `🎤 <b>Голос</b> — наговорите размеры голосом\n` +
        `✏️ <b>Текст</b> — напишите размеры или задайте вопрос\n\n` +
        `<b>Команды:</b>\n` +
        `/new — начать новый расчёт\n` +
        `/kp — последние КП\n` +
        `/post — создать Instagram пост из фото\n` +
        `/help — эта справка`
      );
      break;
    }

    default:
      break;
  }
}
