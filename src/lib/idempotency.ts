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

  // Уборка: ответы старше 30 дней никому не нужны (очередь на телефоне живёт
  // часы). Чистим изредка, чтобы таблица не росла вечно.
  if (Math.random() < 0.02) {
    await prisma.clientOp
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
  }

  // Сначала «занимаем» операцию строкой-заглушкой (21.09.2026). Раньше ответ
  // записывался ПОСЛЕ выполнения, и два одновременных повтора (очередь на
  // телефоне + ручной тап) оба проходили проверку и оба создавали запись.
  // Теперь второй запрос упирается в уникальный id и ждёт ответ первого.
  const PENDING = { __pending: true } as const;
  const isPending = (v: unknown) => !!v && typeof v === "object" && (v as { __pending?: boolean }).__pending === true;
  const replay = (body: unknown) => NextResponse.json(body, { status: 200, headers: { "x-op-replayed": "1" } });

  let claimed = false;
  try {
    await prisma.clientOp.create({ data: { id: opId, masterId, path, response: PENDING } });
    claimed = true;
  } catch {
    // id уже есть — готовый ответ, выполняется прямо сейчас либо зависшая заглушка
  }

  if (!claimed) {
    for (let i = 0; i < 12; i++) {
      const seen = await prisma.clientOp.findUnique({ where: { id: opId } }).catch(() => null);
      if (!seen) break; // первый запрос упал и снял заглушку — выполняем сами
      // Чужой id (другой мастер угадал uuid) — не отдаём чужой ответ.
      if (seen.masterId !== masterId) return run();
      if (!isPending(seen.response)) return replay(seen.response);
      // Заглушка старше минуты — процесс умер посередине, забираем операцию себе.
      if (Date.now() - seen.createdAt.getTime() > 60_000) {
        await prisma.clientOp.delete({ where: { id: opId } }).catch(() => {});
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
      if (i === 11) {
        // Первый запрос всё ещё идёт — просим телефон повторить позже (очередь 429 повторяет).
        return NextResponse.json({ error: "Операция ещё выполняется" }, { status: 429, headers: { "Retry-After": "3" } });
      }
    }
    try {
      await prisma.clientOp.create({ data: { id: opId, masterId, path, response: PENDING } });
    } catch {
      return NextResponse.json({ error: "Операция ещё выполняется" }, { status: 429, headers: { "Retry-After": "3" } });
    }
  }

  let res: NextResponse;
  try {
    res = await run();
  } catch (e) {
    await prisma.clientOp.delete({ where: { id: opId } }).catch(() => {});
    throw e;
  }
  let saved = false;
  if (res.ok) {
    try {
      const body = await res.clone().json();
      await prisma.clientOp.update({ where: { id: opId }, data: { response: body } });
      saved = true;
    } catch {
      // не-JSON ответ — запоминать нечего
    }
  }
  // Ошибка или нечего запомнить — снимаем заглушку, чтобы повтор выполнился заново.
  if (!saved) await prisma.clientOp.delete({ where: { id: opId } }).catch(() => {});
  return res;
}
