/**
 * Имя КП без объекта — одно на всё приложение (26.09.2026).
 *
 * Такие КП (быстрые, и те, чей замер «съеден» до 19.09) живут в трёх местах:
 * в ленте объектов, в «Сегодня» и в «Деньгах». Каждое место называло их
 * по-своему — «КП 20.0 м²», «КП на 383 022 ₸», «Быстрое КП от 18 июн.» —
 * и мастер не мог понять, что это одно и то же, и не находил его, чтобы
 * удалить. Теперь имя одно, и в нём есть дата СОЗДАНИЯ: у КП с июня не
 * должна стоять сентябрьская дата только потому, что его открыли.
 */

type OrphanLike = {
  clientAddress?: string | null;
  clientName?: string | null;
  client?: { name: string | null } | null;
  totalArea?: number | null;
  createdAt: Date;
};

const MONTHS_RU = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function shortDate(d: Date): string {
  const z = new Date(d.getTime() + 5 * 60 * 60 * 1000); // Алматы
  return `${z.getUTCDate()} ${MONTHS_RU[z.getUTCMonth()]}`;
}

export function orphanEstimateTitle(e: OrphanLike): string {
  const named = e.clientAddress || e.client?.name || e.clientName;
  if (named) return named;
  const area = e.totalArea ?? 0;
  const date = shortDate(e.createdAt);
  return area > 0 ? `КП ${Math.round(area)} м² от ${date}` : `Быстрое КП от ${date}`;
}
