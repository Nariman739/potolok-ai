import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

const NARIMAN_CHAT_ID = "499592803";

const TYPE_LABELS: Record<string, string> = {
  master: "Мастер НП",
  distributor: "Дистрибьютор",
  salon: "Салон / шоурум",
};

export async function POST(request: Request) {
  try {
    const { name, phone, city, type, objectsPerMonth, source } =
      await request.json();

    if (!name?.trim() || !phone?.trim() || !city?.trim()) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    const text = [
      `<b>🎪 Лид с Потолок Феста</b>`,
      ``,
      `<b>Имя:</b> ${name.trim()}`,
      `<b>Телефон:</b> ${phone.trim()}`,
      `<b>Город:</b> ${city.trim()}`,
      `<b>Тип:</b> ${TYPE_LABELS[type] || type}`,
      objectsPerMonth?.trim()
        ? `<b>Объектов в мес:</b> ${objectsPerMonth.trim()}`
        : null,
      `<b>Источник:</b> ${source || "direct"}`,
      ``,
      `Промокод <code>FEST2026</code> → 3 месяца Pro`,
    ]
      .filter(Boolean)
      .join("\n");

    await sendTelegramMessage(NARIMAN_CHAT_ID, text);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ошибка отправки" }, { status: 500 });
  }
}
