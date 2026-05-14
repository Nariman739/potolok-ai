import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runVisionAgents } from "@/lib/vision-agents";

/**
 * POST /api/assistant/parse-techpassport
 * Multipart: file (image of techpassport / floor plan)
 *
 * Распознаёт фото тех.паспорта квартиры → возвращает массив комнат с
 * размерами в см. Использует runVisionAgents — тот же pipeline что и
 * Telegram bot для распознавания фото замеров.
 *
 * Возврат: { rooms: [{ name, walls_cm, area, perimeter, corners }] }
 *
 * Цель: дать мастеру быстро оценить квартиру по фото плана без выезда.
 * Точная цена — после реального замера.
 */
export async function POST(request: Request) {
  try {
    await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Фото максимум 10MB" }, { status: 400 });
    }

    // Конвертим в base64 data URL для Claude Vision
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/jpeg";
    const imageBase64Url = `data:${mimeType};base64,${base64}`;

    // Запускаем vision pipeline (re-use существующий код)
    const result = await runVisionAgents(imageBase64Url);

    if (result.rooms.length === 0) {
      return NextResponse.json(
        {
          error:
            "AI не распознал комнаты на фото. Проверь что план чёткий и размеры читаются. Попробуй ещё раз или введи замер вручную.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      rooms: result.rooms.map((r) => ({
        name: r.name,
        walls_cm: r.walls_cm,
        area: r.area,
        perimeter: r.perimeter,
        corners: r.corners,
      })),
      totalArea: result.totalArea,
      totalPerimeter: result.totalPerimeter,
      totalRooms: result.totalRooms,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Parse techpassport error:", error);
    return NextResponse.json(
      { error: "Не удалось распознать. AI временно недоступен или фото плохое качество." },
      { status: 500 },
    );
  }
}
