import { after } from "next/server";
import { requireAuth } from "@/lib/auth";
import { companyIdFor } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { checkAiBudget, recordAiUsage, masterRole, computeCostFromUsage } from "@/lib/ai-cost-cap";
import { buildSystemPrompt, VISION_EXTRACTION_PROMPT, computeRoomSummary } from "@/lib/assistant-prompt";
import { quickAnswer } from "@/lib/assistant-quick";
import { calculate } from "@/lib/calculate";
import { DEFAULT_PRICES } from "@/lib/constants";
import type { ChatMessage, RoomInput } from "@/lib/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const maxDuration = 60;

// Agent 1: Vision Extractor — extracts all rooms from photo document
async function extractRoomsFromPhoto(
  imageUrl: string,
): Promise<{ data: string | null; costUsd: number }> {
  try {
    const result = await getOpenRouter().chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: VISION_EXTRACTION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Извлеки все помещения из этого документа" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      stream: false,
      max_tokens: 2000,
    });
    const costUsd = computeCostFromUsage(result.usage, AI_MODEL);
    const raw = result.choices[0]?.message?.content?.trim() || null;
    if (!raw) return { data: null, costUsd };

    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    const cleaned = jsonStart !== -1 && jsonEnd > jsonStart
      ? raw.slice(jsonStart, jsonEnd + 1).trim()
      : raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    JSON.parse(cleaned);
    return { data: cleaned, costUsd };
  } catch (e) {
    console.error("Vision extraction failed:", e);
    return { data: null, costUsd: 0 };
  }
}

export async function POST(request: Request) {
  try {
    const master = await requireAuth();

    const budget = await checkAiBudget(master.id, masterRole(master));
    if (!budget.allowed) {
      return new Response(
        JSON.stringify({ error: "AI daily limit reached", remainingUsd: 0, resetAt: budget.resetAt }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const {
      message,
      imageUrl,
      sessionId: inputSessionId,
    } = body as {
      message: string;
      imageUrl?: string;
      sessionId?: string;
    };

    if (!message && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Сообщение или фото обязательно" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load master prices
    const masterPrices = await prisma.masterPrice.findMany({
      where: { masterId: master.id },
    });
    const prices: Record<string, number> = { ...DEFAULT_PRICES };
    for (const mp of masterPrices) {
      prices[mp.itemCode] = mp.price;
    }

    // Get or create chat session
    let sessionId = inputSessionId;
    let chatSession;

    if (sessionId) {
      chatSession = await prisma.chatSession.findFirst({
        where: { id: sessionId, masterId: master.id, status: "ACTIVE" },
      });
    }

    if (!chatSession) {
      chatSession = await prisma.chatSession.create({
        data: { masterId: master.id },
      });
      sessionId = chatSession.id;
    }

    const existingMessages = (chatSession.messages ?? []) as unknown as ChatMessage[];

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message || "Отправлено фото",
      imageUrl,
      timestamp: new Date().toISOString(),
    };

    const allMessages = [...existingMessages, userMsg];

    const photoUrls = [...(chatSession.photoUrls || [])];
    if (imageUrl) photoUrls.push(imageUrl);

    // Мобилка ходит с Bearer-токеном, веб — с cookie: подсказки «где что»
    // должны быть словами того интерфейса, из которого спрашивают.
    const platform = request.headers.get("authorization")?.startsWith("Bearer ") ? "mobile" : "web";
    const systemPrompt = buildSystemPrompt(
      master.companyName || master.firstName,
      prices,
      { platform }
    );

    let fullContent = "";

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID immediately so frontend knows the session
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "session", sessionId })}\n\n`
            )
          );

          // Частый вопрос «где/как» — отвечаем сами, без модели (24.09.2026).
          // Текст всё равно взят из навигации помощника, зато мгновенно и
          // бесплатно. Сомнительные формулировки сюда не попадают — они уходят
          // модели, как раньше.
          const quick = !imageUrl && photoUrls.length === 0 ? quickAnswer(message ?? "", false) : null;
          if (quick) {
            for (const part of quick.answer.match(/.{1,40}(\s|$)/g) ?? [quick.answer]) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: part })}\n\n`));
              await new Promise((r) => setTimeout(r, 25));
            }
            const quickMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: quick.answer,
              timestamp: new Date().toISOString(),
            };
            await prisma.chatSession.update({
              where: { id: sessionId },
              data: { messages: JSON.parse(JSON.stringify([...allMessages, quickMsg])) },
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            controller.close();
            return;
          }

          // Agent 1: Vision Extractor (if photo present)
          // Send indicator first so user sees immediate feedback during ~3-5s extraction
          let visionData: string | null = null;
          let totalCostUsd = 0;
          if (imageUrl) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "text", content: "🔍 Анализирую документ..." })}\n\n`
              )
            );
            const visionResult = await extractRoomsFromPhoto(imageUrl);
            visionData = visionResult.data;
            totalCostUsd += visionResult.costUsd;
            // Clear the indicator — send replacement signal so frontend resets this message
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "clear_analyzing" })}\n\n`
              )
            );
          }

          // Build enriched user content for Conversation Agent.
          // Inject deterministic [СВОДКА] so the agent outputs площадь+периметр
          // without spending extra tokens computing it itself.
          let userContent: string;
          if (visionData) {
            const summary = computeRoomSummary(visionData);
            const summaryBlock = summary ? `\n[СВОДКА: ${summary}]` : "";
            userContent = `[ФОТО-АНАЛИЗ: ${visionData}]${summaryBlock}\n\n${message || "Посчитай"}`;
          } else {
            userContent = message || "Отправлено фото";
          }

          // Agent 2: Conversation Agent — build messages
          const openaiMessages: ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
          ];

          // В модель уходила ВСЯ переписка сессии, и каждый следующий ответ
          // стоил дороже предыдущего (24.09.2026). Для вопросов «как и где»
          // хвост разговора не нужен: держим последние сообщения, текущее
          // всегда среди них.
          const HISTORY_LIMIT = 12;
          const history = allMessages.length > HISTORY_LIMIT ? allMessages.slice(-HISTORY_LIMIT) : allMessages;

          for (let i = 0; i < history.length; i++) {
            const msg = history[i];
            const isCurrentMsg = i === history.length - 1;

            if (msg.role === "user") {
              if (isCurrentMsg && visionData) {
                // Vision succeeded — inject extracted data as text
                openaiMessages.push({ role: "user", content: userContent });
              } else if (isCurrentMsg && imageUrl) {
                // Vision failed — fallback: pass image directly
                openaiMessages.push({
                  role: "user",
                  content: [
                    { type: "text", text: message || "Посчитай" },
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

          // Stream conversation agent response.
          // stream_options.include_usage заставляет OpenRouter прислать
          // финальный chunk с usage — без него токены не отсчитаются.
          const stream = await getOpenRouter().chat.completions.create({
            model: AI_MODEL,
            messages: openaiMessages,
            stream: true,
            // Ответ помощника — несколько строк, а не лекция. Расчётный блок
            // room_data короткий, в 900 токенов помещается с запасом.
            max_tokens: 900,
            stream_options: { include_usage: true },
          });

          // Служебный блок feedback мастеру видеть не нужно: он уходил в чат
          // прямо куском JSON (24.09.2026). Вырезать после стрима поздно —
          // текст уже у мастера, поэтому обрываем показ на самом маркере.
          const FEEDBACK_MARK = "```feedback";
          let emitted = 0;
          let suppressed = false;
          const send = (text: string) => {
            if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`));
          };

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              if (!suppressed) {
                const at = fullContent.indexOf(FEEDBACK_MARK);
                if (at >= 0) {
                  suppressed = true;
                  send(fullContent.slice(emitted, at));
                  emitted = at;
                } else {
                  // Маркер может разорваться между чанками — придерживаем хвост
                  // длиной чуть меньше маркера, пока не станет ясно.
                  const safeUpTo = Math.max(emitted, fullContent.length - (FEEDBACK_MARK.length - 1));
                  if (safeUpTo > emitted) {
                    send(fullContent.slice(emitted, safeUpTo));
                    emitted = safeUpTo;
                  }
                }
              }
            }
            if (chunk.usage) {
              totalCostUsd += computeCostFromUsage(chunk.usage, AI_MODEL);
            }
          }

          // Parse room_data block if present
          const roomDataMatch = fullContent.match(
            /```room_data\s*\n([\s\S]*?)\n```/
          );

          let extractedRooms: RoomInput[] | null = null;
          let calculationResult = null;

          if (roomDataMatch) {
            try {
              const rawRooms = JSON.parse(roomDataMatch[1]);
              extractedRooms = rawRooms.map(
                (r: Record<string, unknown>) => {
                  // Support area-only input (when tech passport shows м² but not L×W)
                  // Estimate dimensions from area using typical room proportions (1.3:1 ratio)
                  const area = Number(r.area) || 0;
                  let length = Number(r.length) || 0;
                  let width = Number(r.width) || 0;

                  if (area > 0 && (length === 0 || width === 0)) {
                    // ratio 1.3:1 → length = √(area * 1.3), width = √(area / 1.3)
                    length = Math.round(Math.sqrt(area * 1.3) * 10) / 10;
                    width = Math.round(Math.sqrt(area / 1.3) * 10) / 10;
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
                }
              );

              calculationResult = calculate(extractedRooms!, prices);

              // Send calculation result
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "calculation",
                    result: calculationResult,
                    rooms: extractedRooms,
                  })}\n\n`
                )
              );
            } catch (e) {
              console.error("Failed to parse room_data:", e);
            }
          }

          // Parse client_data block if present
          const clientDataMatch = fullContent.match(
            /```client_data\s*\n([\s\S]*?)\n```/
          );

          if (clientDataMatch) {
            try {
              const clientData = JSON.parse(clientDataMatch[1]);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "client_data",
                    data: clientData,
                  })}\n\n`
                )
              );
            } catch (e) {
              console.error("Failed to parse client_data:", e);
            }
          }

          // Придержанный хвост (маркер так и не появился) — дошлём.
          if (!suppressed && emitted < fullContent.length) send(fullContent.slice(emitted));

          // Пожелание мастера (24.09.2026): ассистент спрашивает, чего не
          // хватает, и кладёт ответ отдельным блоком. Блок служебный —
          // сохраняем и вырезаем, мастеру его видеть незачем.
          const feedbackMatch = fullContent.match(/```feedback\s*\n([\s\S]*?)\n```/);
          if (feedbackMatch) {
            fullContent = fullContent.replace(feedbackMatch[0], "").replace(/\n{3,}/g, "\n\n").trim();
            try {
              const parsed = JSON.parse(feedbackMatch[1]) as { topic?: unknown; text?: unknown };
              const text = typeof parsed.text === "string" ? parsed.text.trim().slice(0, 500) : "";
              const topic = typeof parsed.topic === "string" ? parsed.topic.trim().slice(0, 40) : "другое";
              if (text.length >= 3) {
                after(async () => {
                  try {
                    await prisma.masterFeedback.create({
                      data: { masterId: master.id, companyId: await companyIdFor(master.id), topic, text, source: "assistant" },
                    });
                  } catch (e) {
                    console.error("Failed to save feedback:", e);
                  }
                });
              }
            } catch (e) {
              console.error("Failed to parse feedback:", e);
            }
          }

          // Build assistant message
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullContent,
            timestamp: new Date().toISOString(),
            calculationResult: calculationResult ?? undefined,
          };

          // Save to DB
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
            where: { id: sessionId },
            data: updateData,
          });

          await recordAiUsage(master.id, totalCostUsd);

          // Send done
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          // Мастеру нужен понятный текст и знание, что делать (22.09.2026).
          // Раньше любая причина схлопывалась в «Ошибка AI»: когда на счету
          // модели кончились деньги (402), это выглядело как поломка приложения.
          const status = (error as { status?: number } | null)?.status;
          const message =
            status === 402
              ? "Ассистент временно недоступен — закончился лимит. Уже пополняем, попробуй позже. Замеры, КП и цех работают как обычно."
              : status === 429
                ? "Слишком много вопросов подряд. Подожди минуту и спроси ещё раз."
                : status === 401 || status === 403
                  ? "Ассистент временно недоступен. Мы уже чиним."
                  : "Не получилось ответить. Попробуй ещё раз.";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message, retriable: status !== 402 })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Chat error:", errMsg);
    return new Response(
      JSON.stringify({ error: "Ошибка чата" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
