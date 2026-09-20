import { NextResponse } from "next/server";
import { prisma } from "./prisma";

/**
 * Идемпотентность записей с мобилки (Этап 2, 20.09.2026).
 *
 * Мобилка кладёт в заголовок `X-Op-Id` uuid операции. На объекте связь
 * рвётся: запрос мог дойти, а ответ — нет, и очередь на телефоне повторит
 * его. Без защиты каждый повтор создавал бы новый объект или новую отправку
 * в цех. Здесь первый успешный ответ запоминается и отдаётся повторно.
 *
 * Без заголовка (веб, старые версии приложения) — обычное выполнение.
 */
export async function withIdempotency(
  request: Request,
  masterId: string,
  path: string,
  run: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const opId = request.headers.get("x-op-id")?.trim();
  if (!opId || opId.length > 80) return run();

  const seen = await prisma.clientOp.findUnique({ where: { id: opId } }).catch(() => null);
  if (seen) {
    // Чужой id (другой мастер угадал uuid) — не отдаём чужой ответ.
    if (seen.masterId !== masterId) return run();
    return NextResponse.json(seen.response, { status: 200, headers: { "x-op-replayed": "1" } });
  }

  const res = await run();
  if (res.ok) {
    try {
      const body = await res.clone().json();
      await prisma.clientOp.create({ data: { id: opId, masterId, path, response: body } });
    } catch {
      // Гонка двух одинаковых запросов или не-JSON ответ — не страшно.
    }
  }
  return res;
}
