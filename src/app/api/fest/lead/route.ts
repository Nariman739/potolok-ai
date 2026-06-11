import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";
import { checkRateLimit } from "@/lib/rate-limit";

const NARIMAN_CHAT_ID = "499592803";

const TYPE_LABELS: Record<string, string> = {
  master: "Мастер НП",
  distributor: "Дистрибьютор",
  salon: "Салон / шоурум",
};

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);

    // Rate-limit: 5 заявок в час на IP — реальный мастер столько не подаст,
    // а спамеру упрётся.
    const rl = await checkRateLimit(`fest-lead:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Слишком много заявок. Попробуйте через час." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { name, phone, city, type, objectsPerMonth, source, website } = body as {
      name?: string;
      phone?: string;
      city?: string;
      type?: string;
      objectsPerMonth?: string;
      source?: string;
      website?: string; // honeypot — реальные юзеры это поле не видят
    };

    // Honeypot: бот заполнит скрытое поле, отдаём fake-success чтобы не палить.
    if (website && website.trim().length > 0) {
      return NextResponse.json({ ok: true });
    }

    if (!name?.trim() || !phone?.trim() || !city?.trim()) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    // Дополнительные базовые санитайз-чеки на длину
    if (name.length > 100 || phone.length > 30 || city.length > 100) {
      return NextResponse.json({ error: "Слишком длинное значение" }, { status: 400 });
    }

    const text = [
      `<b>🎪 Лид с Потолок Феста</b>`,
      ``,
      `<b>Имя:</b> ${name.trim()}`,
      `<b>Телефон:</b> ${phone.trim()}`,
      `<b>Город:</b> ${city.trim()}`,
      `<b>Тип:</b> ${TYPE_LABELS[type ?? ""] || type || "не указан"}`,
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
