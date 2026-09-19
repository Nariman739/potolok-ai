/**
 * Пуш-уведомления мастеру на телефон (Expo Push Service).
 *
 * Зачем: до 19.09.2026 единственным каналом был Telegram, а он привязан
 * у 32 мастеров из 342. То есть 91% никогда не узнавали, что клиент открыл
 * или принял их КП — самое ценное событие в продаже просто не доходило.
 *
 * Expo отправляет пуши по токену вида ExpoPushToken[xxx] без ключей APNs/FCM
 * на нашей стороне. Токен приложение получает само и шлёт в POST /api/push/register.
 */
import { prisma } from "@/lib/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo принимает максимум 100 сообщений за раз. */
const CHUNK = 100;

export type PushPayload = {
  title: string;
  body: string;
  /** Куда открыть приложение по тапу: { screen: "/estimate/123" } */
  data?: Record<string, string>;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Шлёт уведомление на все живые устройства мастера.
 * Никогда не бросает — уведомление не должно ронять основной сценарий
 * (подтверждение КП клиентом важнее, чем доставка пуша мастеру).
 * Возвращает, сколько устройств приняли сообщение.
 */
export async function sendPushToMaster(
  masterId: string,
  payload: PushPayload,
): Promise<number> {
  try {
    const devices = await prisma.pushDevice.findMany({
      where: { masterId, disabledAt: null },
      select: { id: true, token: true },
    });
    if (devices.length === 0) return 0;

    let delivered = 0;
    for (let i = 0; i < devices.length; i += CHUNK) {
      const slice = devices.slice(i, i + CHUNK);
      const messages = slice.map((d) => ({
        to: d.token,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default" as const,
        priority: "high" as const,
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn("Expo push HTTP error:", res.status);
        continue;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];

      // Токены умерших устройств гасим, чтобы не долбиться в них вечно:
      // приложение удалили или мастер выключил уведомления.
      const dead: string[] = [];
      tickets.forEach((t, idx) => {
        if (t.status === "ok") {
          delivered++;
        } else if (t.details?.error === "DeviceNotRegistered") {
          dead.push(slice[idx].id);
        } else {
          console.warn("Expo push ticket error:", t.message);
        }
      });

      if (dead.length > 0) {
        await prisma.pushDevice.updateMany({
          where: { id: { in: dead } },
          data: { disabledAt: new Date() },
        });
      }
    }
    return delivered;
  } catch (e) {
    console.warn("sendPushToMaster failed:", e);
    return 0;
  }
}
