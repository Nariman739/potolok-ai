import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOpenRouter } from "@/lib/openrouter";

const PARSE_MODEL = "anthropic/claude-sonnet-4";

const SYSTEM_PROMPT = `Ты — помощник мастера натяжных потолков. Мастер надиктовал список работ голосом или текстом.

Твоя задача: извлечь позиции работ с ценами в JSON.

Правила:
- Извлекай ТОЛЬКО то что сказал мастер. Не добавляй лишнего.
- Цены в тенге (₸). Если мастер сказал "двадцать" или "20" — это 20 000 ₸.
- Если мастер сказал "по 3 тысячи" и "3 штуки" — unitPrice=3000, quantity=3.
- Если количество не указано — quantity=1.
- Единица: "шт." по умолчанию, "м²" для площадей, "м.п." для погонных метров.
- Название работы должно быть коротким и понятным для клиента.

Отвечай ТОЛЬКО валидным JSON массивом, без markdown, без пояснений:
[{"name":"Слив воды","quantity":1,"unit":"шт.","unitPrice":20000},...]`;

export async function POST(request: Request) {
  try {
    await requireAuth();

    const { text } = await request.json();
    if (!text || typeof text !== "string" || text.trim().length < 3) {
      return NextResponse.json({ error: "Введите описание работ" }, { status: 400 });
    }

    const openrouter = getOpenRouter();
    const completion = await openrouter.chat.completions.create({
      model: PARSE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.trim() },
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "[]";

    // Parse JSON — strip markdown fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let items: { name: string; quantity: number; unit: string; unitPrice: number }[];
    try {
      items = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Не удалось распознать. Попробуйте перефразировать." }, { status: 422 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Не найдены позиции работ. Укажите работы и цены." }, { status: 422 });
    }

    // Validate and clean
    const cleaned = items.map((item, i) => ({
      name: String(item.name || `Работа ${i + 1}`).slice(0, 200),
      quantity: Math.max(Number(item.quantity) || 1, 1),
      unit: String(item.unit || "шт.").slice(0, 10),
      unitPrice: Math.max(Number(item.unitPrice) || 0, 0),
    }));

    return NextResponse.json({ items: cleaned });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    console.error("Quick estimate parse error:", error);
    return NextResponse.json({ error: "Ошибка распознавания" }, { status: 500 });
  }
}
