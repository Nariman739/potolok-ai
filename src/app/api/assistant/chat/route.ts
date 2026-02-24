import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { buildSystemPrompt } from "@/lib/assistant-prompt";
import { calculate } from "@/lib/calculate";
import { DEFAULT_PRICES } from "@/lib/constants";
import type { ChatMessage, RoomInput } from "@/lib/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export async function POST(request: Request) {
  try {
    const master = await requireAuth();
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

    // Build user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message || "Отправлено фото",
      imageUrl,
      timestamp: new Date().toISOString(),
    };

    const allMessages = [...existingMessages, userMsg];

    // Update photo urls
    const photoUrls = [...(chatSession.photoUrls || [])];
    if (imageUrl) photoUrls.push(imageUrl);

    // Build OpenAI messages
    const systemPrompt = buildSystemPrompt(
      master.companyName || master.firstName,
      prices
    );

    const openaiMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    for (const msg of allMessages) {
      if (msg.role === "user") {
        if (msg.imageUrl) {
          openaiMessages.push({
            role: "user",
            content: [
              { type: "text", text: msg.content },
              { type: "image_url", image_url: { url: msg.imageUrl } },
            ],
          });
        } else {
          openaiMessages.push({ role: "user", content: msg.content });
        }
      } else {
        openaiMessages.push({ role: "assistant", content: msg.content });
      }
    }

    // Stream response
    const stream = await getOpenRouter().chat.completions.create({
      model: AI_MODEL,
      messages: openaiMessages,
      stream: true,
      max_tokens: 2000,
    });

    let fullContent = "";

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID first
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "session", sessionId })}\n\n`
            )
          );

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text", content: delta })}\n\n`
                )
              );
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
                (r: Record<string, unknown>) => ({
                  id: crypto.randomUUID(),
                  name: r.name || "Комната",
                  length: Number(r.length) || 0,
                  width: Number(r.width) || 0,
                  ceilingHeight: Number(r.ceilingHeight) || 2.5,
                  canvasType: (r.canvasType as string) || "mat",
                  spotsCount: Number(r.spotsCount) || 0,
                  chandelierCount: Number(r.chandelierCount) || 0,
                  trackMagneticLength: 0,
                  lightLineLength: 0,
                  curtainRodLength: Number(r.curtainRodLength) || 0,
                  pipeBypasses: Number(r.pipeBypasses) || 0,
                  cornersCount: Number(r.cornersCount) || 4,
                  eurobrusCount: 0,
                })
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

          // Send done
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: "Ошибка AI",
              })}\n\n`
            )
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
    console.error("Chat error:", errMsg, error);
    return new Response(
      JSON.stringify({ error: "Ошибка чата", detail: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
