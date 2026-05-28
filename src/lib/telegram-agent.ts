// CRM-агент для Telegram-бота. Обрабатывает текстовые команды мастера:
// «найди Шокана», «запиши замер у Айгуль завтра в 14», «что у меня сегодня»,
// «поменяй Шокану статус на отказ» и т.д.
//
// Использует Claude Sonnet 4 через OpenRouter с tool calling (OpenAI-compat).
// Tools работают через Prisma напрямую — никаких HTTP-запросов внутри tools,
// чтобы уложиться в Vercel 60s функции.

import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import type { DealStatus, EventType } from "@/generated/prisma/client";

const ALLOWED_EVENT_TYPES: EventType[] = [
  "CALL", "MEETING", "MEASUREMENT", "INSTALL", "WHATSAPP", "NOTE",
];
// AI-агент пишет только 4 канонических статуса. Legacy остаются в БД
// для старых строк, но новые операции — только эти.
const ALLOWED_STATUSES: DealStatus[] = [
  "NEW", "IN_PROGRESS", "WON", "LOST",
];
const STATUS_LABELS: Record<DealStatus, string> = {
  NEW: "Новый",
  QUALIFIED: "В работе",
  PROPOSAL_SENT: "В работе",
  NEGOTIATING: "В работе",
  IN_PROGRESS: "В работе",
  WON: "Сделка",
  LOST: "Отказ",
};
const EVENT_LABELS: Record<EventType, string> = {
  CALL: "Звонок",
  MEETING: "Встреча",
  MEASUREMENT: "Замер",
  INSTALL: "Монтаж",
  WHATSAPP: "WhatsApp",
  NOTE: "Заметка",
  KP_CREATED: "КП создан",
  KP_VIEWED: "Клиент открыл КП",
  KP_CONFIRMED: "КП подтверждён",
  KP_REJECTED: "КП отклонён",
  STATUS_CHANGE: "Смена статуса",
  CONTRACT_CREATED: "Договор создан",
  CONTRACT_SIGNED: "Договор подписан",
  ACT_CREATED: "Акт создан",
  ACT_SIGNED: "Акт подписан",
  PHOTO_ADDED: "Фото добавлено",
};

// ============================================================
// TOOL DEFINITIONS (OpenAI-compatible)
// ============================================================
const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_client",
      description: "Найти клиентов по имени или телефону. Используй когда мастер упоминает клиента по имени.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Имя или телефон для поиска" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summary_client",
      description: "Получить полную сводку по клиенту: статус, телефон, адрес, последние КП, события. Используй после find_client.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID клиента (получен через find_client)" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_event",
      description: "Запланировать событие (замер, монтаж, встречу, звонок) с клиентом. Поставит автоматическое напоминание за час.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID клиента" },
          event_type: { type: "string", enum: ALLOWED_EVENT_TYPES, description: "Тип события" },
          datetime_iso: { type: "string", description: "Дата и время в ISO формате (Asia/Almaty timezone). Например 2026-05-18T14:00:00+05:00" },
          note: { type: "string", description: "Опциональная заметка о событии" },
        },
        required: ["client_id", "event_type", "datetime_iso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_today_events",
      description: "Получить план дня мастера — все события на сегодня и завтра.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clients_by_status",
      description: "Список клиентов мастера в определённом статусе воронки. Используй для «кто у меня в переговорах», «покажи новых» и т.д.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ALLOWED_STATUSES, description: "Статус сделки" },
          limit: { type: "number", description: "Максимум клиентов (default 20)" },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client_status",
      description: "Изменить статус клиента в воронке (Новый/Квалифицирован/КП отправлен/Переговоры/Сделка/Отказ).",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID клиента" },
          new_status: { type: "string", enum: ALLOWED_STATUSES, description: "Новый статус" },
        },
        required: ["client_id", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_note_to_client",
      description: "Добавить заметку к клиенту в Историю. Используй для записи комментариев мастера про клиента.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "ID клиента" },
          note: { type: "string", description: "Текст заметки" },
        },
        required: ["client_id", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_estimates",
      description: "Последние N созданных КП мастера с цифрами.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Сколько последних КП (default 5, max 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "month_stats",
      description: "Статистика мастера за текущий месяц: сколько новых клиентов, сколько КП, сколько сделок, сумма выигранных сделок.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ============================================================
// TOOL HANDLERS
// ============================================================

type ToolArgs = Record<string, unknown>;

async function executeTool(name: string, args: ToolArgs, masterId: string): Promise<string> {
  try {
    switch (name) {
      case "find_client": {
        const q = String(args.query || "").trim();
        if (!q) return JSON.stringify({ error: "query пустой" });
        const digitsOnly = q.replace(/\D/g, "");
        const clients = await prisma.client.findMany({
          where: {
            masterId,
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              ...(digitsOnly ? [{ phone: { contains: digitsOnly } }] : []),
            ],
          },
          select: { id: true, name: true, phone: true, address: true, status: true },
          take: 10,
          orderBy: { updatedAt: "desc" },
        });
        return JSON.stringify({ found: clients.length, clients });
      }

      case "summary_client": {
        const id = String(args.client_id || "");
        const c = await prisma.client.findFirst({
          where: { id, masterId },
          include: {
            estimates: {
              orderBy: { createdAt: "desc" },
              take: 5,
              select: { id: true, total: true, status: true, totalArea: true, createdAt: true },
            },
            events: {
              orderBy: { createdAt: "desc" },
              take: 8,
              select: { type: true, content: true, scheduledAt: true, createdAt: true },
            },
          },
        });
        if (!c) return JSON.stringify({ error: "Клиент не найден" });
        return JSON.stringify({
          id: c.id,
          name: c.name,
          phone: c.phone,
          address: c.address,
          status: c.status,
          status_label: STATUS_LABELS[c.status],
          notes: c.notes,
          estimates_count: c.estimates.length,
          estimates: c.estimates.map((e) => ({
            total: e.total,
            totalArea: e.totalArea,
            status: e.status,
            createdAt: e.createdAt.toISOString(),
          })),
          recent_events: c.events.map((e) => ({
            type: EVENT_LABELS[e.type] ?? e.type,
            content: e.content,
            scheduledAt: e.scheduledAt?.toISOString(),
            createdAt: e.createdAt.toISOString(),
          })),
        });
      }

      case "schedule_event": {
        const id = String(args.client_id || "");
        const type = args.event_type as EventType;
        const dt = new Date(String(args.datetime_iso || ""));
        const note = args.note ? String(args.note) : null;
        if (!ALLOWED_EVENT_TYPES.includes(type)) {
          return JSON.stringify({ error: `event_type должен быть один из: ${ALLOWED_EVENT_TYPES.join(", ")}` });
        }
        if (isNaN(dt.getTime())) return JSON.stringify({ error: "datetime_iso некорректен" });
        const c = await prisma.client.findFirst({ where: { id, masterId }, select: { id: true, name: true } });
        if (!c) return JSON.stringify({ error: "Клиент не найден" });
        const dateStr = dt.toLocaleString("ru-RU", {
          day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
          timeZone: "Asia/Almaty",
        });
        const created = await prisma.clientEvent.create({
          data: {
            clientId: id,
            type,
            content: note ?? `${EVENT_LABELS[type]} ${dateStr}`,
            scheduledAt: dt,
          },
        });
        return JSON.stringify({
          ok: true,
          event_id: created.id,
          client: c.name,
          when: dateStr,
          type: EVENT_LABELS[type],
          reminder_at: new Date(dt.getTime() - 60 * 60 * 1000).toISOString(),
        });
      }

      case "list_today_events": {
        const now = new Date();
        const endOfTomorrow = new Date(now.getTime() + 36 * 60 * 60 * 1000);
        const events = await prisma.clientEvent.findMany({
          where: {
            client: { masterId },
            scheduledAt: { gte: now, lte: endOfTomorrow },
          },
          include: { client: { select: { name: true, phone: true, address: true } } },
          orderBy: { scheduledAt: "asc" },
          take: 30,
        });
        return JSON.stringify({
          count: events.length,
          events: events.map((e) => ({
            type: EVENT_LABELS[e.type] ?? e.type,
            client: e.client.name,
            phone: e.client.phone,
            address: e.client.address,
            scheduledAt: e.scheduledAt?.toISOString(),
            note: e.content,
          })),
        });
      }

      case "list_clients_by_status": {
        const status = args.status as DealStatus;
        const limit = Math.min(Number(args.limit ?? 20), 50);
        if (!ALLOWED_STATUSES.includes(status)) {
          return JSON.stringify({ error: `status должен быть: ${ALLOWED_STATUSES.join(", ")}` });
        }
        const clients = await prisma.client.findMany({
          where: { masterId, status },
          select: { id: true, name: true, phone: true, address: true, updatedAt: true, _count: { select: { estimates: true } } },
          orderBy: { updatedAt: "desc" },
          take: limit,
        });
        return JSON.stringify({
          status: STATUS_LABELS[status],
          count: clients.length,
          clients: clients.map((c) => ({
            id: c.id, name: c.name, phone: c.phone, address: c.address,
            estimates_count: c._count.estimates,
          })),
        });
      }

      case "update_client_status": {
        const id = String(args.client_id || "");
        const newStatus = args.new_status as DealStatus;
        if (!ALLOWED_STATUSES.includes(newStatus)) {
          return JSON.stringify({ error: "Неверный статус" });
        }
        const c = await prisma.client.findFirst({ where: { id, masterId } });
        if (!c) return JSON.stringify({ error: "Клиент не найден" });
        const prev = c.status;
        await prisma.$transaction([
          prisma.client.update({ where: { id }, data: { status: newStatus } }),
          prisma.clientEvent.create({
            data: {
              clientId: id,
              type: "STATUS_CHANGE",
              content: `${STATUS_LABELS[prev]} → ${STATUS_LABELS[newStatus]}`,
            },
          }),
        ]);
        return JSON.stringify({ ok: true, client: c.name, from: STATUS_LABELS[prev], to: STATUS_LABELS[newStatus] });
      }

      case "add_note_to_client": {
        const id = String(args.client_id || "");
        const note = String(args.note || "").trim();
        if (!note) return JSON.stringify({ error: "Заметка пустая" });
        const c = await prisma.client.findFirst({ where: { id, masterId }, select: { id: true, name: true } });
        if (!c) return JSON.stringify({ error: "Клиент не найден" });
        await prisma.clientEvent.create({
          data: { clientId: id, type: "NOTE", content: note },
        });
        return JSON.stringify({ ok: true, client: c.name, note });
      }

      case "recent_estimates": {
        const limit = Math.min(Number(args.limit ?? 5), 20);
        const ests = await prisma.estimate.findMany({
          where: { masterId },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true, total: true, totalArea: true, status: true,
            client: { select: { name: true, phone: true } },
            createdAt: true,
          },
        });
        return JSON.stringify({
          count: ests.length,
          estimates: ests.map((e) => ({
            client: e.client?.name ?? "—",
            phone: e.client?.phone ?? null,
            total: e.total,
            totalArea: e.totalArea,
            status: e.status,
            createdAt: e.createdAt.toISOString(),
          })),
        });
      }

      case "month_stats": {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const [newClients, kpCreated, wonClients] = await Promise.all([
          prisma.client.count({ where: { masterId, createdAt: { gte: start } } }),
          prisma.estimate.count({ where: { masterId, createdAt: { gte: start } } }),
          prisma.client.findMany({
            where: { masterId, status: "WON", updatedAt: { gte: start } },
            select: { estimates: { select: { total: true } } },
          }),
        ]);
        const wonTotal = wonClients.reduce(
          (sum, c) => sum + c.estimates.reduce((s, e) => s + (e.total || 0), 0),
          0,
        );
        return JSON.stringify({
          month: now.toLocaleString("ru-RU", { month: "long", year: "numeric" }),
          new_clients: newClients,
          kp_created: kpCreated,
          deals_won: wonClients.length,
          total_won_sum: wonTotal,
        });
      }

      default:
        return JSON.stringify({ error: `Неизвестный tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}

// ============================================================
// MAIN AGENT
// ============================================================

const SYSTEM_PROMPT = (masterName: string, nowIso: string) => `Ты — личный CRM-помощник мастера натяжных потолков по имени ${masterName}. Работаешь через Telegram.

Текущее время: ${nowIso} (Asia/Almaty).

Правила:
- Отвечай ПО-РУССКИ, кратко, дружески, на "ты".
- Когда нужно действие — вызывай tool. Не выдумывай данные.
- Если мастер упоминает клиента по имени — сначала find_client, потом действие.
- Даты в schedule_event: указывай ISO с +05:00 (Asia/Almaty). «Завтра в 14» = завтрашний день, 14:00:00+05:00.
- После выполнения tool — кратко подтверди мастеру что сделал, БЕЗ перечисления внутренних данных.
- Используй эмодзи 🔔 ✅ 📅 📞 для статусов.
- НЕ ИСПОЛЬЗУЙ markdown (* ** _) — Telegram HTML или просто текст.
- Если мастер просит расчёт потолка по фото — попроси прислать фото замеров (это другой режим бота).

Что умеешь:
- Записывать замеры/встречи/монтажи на дату+время → автоматическое напоминание за час
- Искать клиентов, давать сводку по клиенту
- Менять статус клиента в воронке (Новый, Квалифицирован, КП отправлен, Переговоры, Сделка, Отказ)
- Добавлять заметки в Историю клиента
- Показывать план дня/завтра
- Список последних КП, статистику за месяц`;

export async function processCRMAgent(masterId: string, userText: string): Promise<string> {
  const master = await prisma.master.findUnique({
    where: { id: masterId },
    select: { firstName: true, companyName: true },
  });
  const name = master?.companyName || master?.firstName || "Мастер";
  const nowIso = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT(name, nowIso) },
    { role: "user", content: userText },
  ];

  const client = getOpenRouter();
  // Iterative loop — Claude может вызывать tools несколько раз
  for (let step = 0; step < 5; step++) {
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      stream: false,
      max_tokens: 1200,
      temperature: 0.2,
    });
    const msg = completion.choices[0]?.message;
    if (!msg) return "⚠️ Что-то пошло не так. Попробуй ещё раз.";

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        const args = JSON.parse(tc.function.arguments || "{}") as ToolArgs;
        const result = await executeTool(tc.function.name, args, masterId);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }
      continue;
    }
    // Финальный ответ
    return (msg.content ?? "").trim() || "Готово.";
  }
  return "⚠️ Слишком много шагов — упрости запрос.";
}
