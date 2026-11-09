import { prisma } from "@/lib/prisma";
import type { CanvasFilm } from "@/lib/canvas-pricing";

/**
 * Плёнка с лестницей ширин: строки PriceItem с общим filmKey, по одной на ступень.
 * Старые сборки приложения эти строки не видят: их отдаёт только /api/prices/films.
 */

export type FilmStepInput = { maxWidthCm: number | null; price: number };
export type FilmInput = { name: string; steps: FilmStepInput[] };

const REQUIRED_WIDTHS = [320, 550];

/** Разбор тела запроса. Строка — текст ошибки для мастера. */
export function parseFilmInput(body: unknown): FilmInput | string {
  const b = (body ?? {}) as { name?: unknown; steps?: unknown };
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return "Укажите название плёнки";
  if (!Array.isArray(b.steps) || b.steps.length > 12) return "Проверьте ширины плёнки";
  const steps: FilmStepInput[] = [];
  for (const raw of b.steps as { maxWidthCm?: unknown; price?: unknown }[]) {
    const price = Number(raw?.price);
    if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) return "Укажите цену для каждой ширины";
    if (raw?.maxWidthCm === null) { steps.push({ maxWidthCm: null, price }); continue; }
    const width = Number(raw?.maxWidthCm);
    if (!Number.isFinite(width) || width < 100 || width > 600) return "Ширина — от 1 до 6 м";
    steps.push({ maxWidthCm: Math.round(width), price });
  }
  if (new Set(steps.map((s) => s.maxWidthCm)).size !== steps.length) return "Одна и та же ширина указана дважды";
  if (!REQUIRED_WIDTHS.every((w) => steps.some((s) => s.maxWidthCm === w))) return "Укажите цены до 3,2 м и до 5,5 м";
  return { name, steps };
}

function stepName(name: string, width: number | null): string {
  if (width === null) return `${name} (любая ширина)`;
  return `${name} (до ${(width / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} м)`;
}

function rowData(companyId: string, filmKey: string, name: string, step: FilmStepInput) {
  const id = crypto.randomUUID();
  return {
    id,
    companyId,
    code: `own:${id}`,
    templateCode: null,
    role: "canvas",
    appliesTo: [],
    category: "canvas",
    needsReview: false,
    name: stepName(name, step.maxWidthCm),
    unit: "м²",
    price: step.price,
    maxWidthCm: step.maxWidthCm,
    filmKey,
    filmName: name,
  };
}

export async function loadFilms(companyId: string): Promise<CanvasFilm[]> {
  const rows = await prisma.priceItem.findMany({
    where: { companyId, deletedAt: null, filmKey: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, price: true, maxWidthCm: true, filmKey: true, filmName: true },
  });
  const films = new Map<string, CanvasFilm>();
  for (const r of rows) {
    const key = r.filmKey as string;
    if (!films.has(key)) films.set(key, { key, name: r.filmName ?? "", steps: [] });
    films.get(key)!.steps.push({ id: r.id, maxWidthCm: r.maxWidthCm, price: r.price });
  }
  for (const film of films.values()) {
    film.steps.sort((a, b) => (a.maxWidthCm ?? Infinity) - (b.maxWidthCm ?? Infinity));
  }
  return [...films.values()];
}

/** Повторное нажатие «Сохранить» не плодит двойников: одно название — одна плёнка. */
export async function createFilm(companyId: string, input: FilmInput): Promise<CanvasFilm | "duplicate"> {
  const same = (await loadFilms(companyId)).find((f) => f.name.toLowerCase() === input.name.toLowerCase());
  if (same) return "duplicate";
  const filmKey = crypto.randomUUID();
  await prisma.priceItem.createMany({ data: input.steps.map((s) => rowData(companyId, filmKey, input.name, s)) });
  return (await loadFilms(companyId)).find((f) => f.key === filmKey)!;
}

/** Ступени с той же шириной обновляются, новые создаются, убранные уходят в удалённые. */
export async function updateFilm(companyId: string, key: string, input: FilmInput): Promise<CanvasFilm | "missing" | "duplicate"> {
  const films = await loadFilms(companyId);
  const film = films.find((f) => f.key === key);
  if (!film) return "missing";
  if (films.some((f) => f.key !== key && f.name.toLowerCase() === input.name.toLowerCase())) return "duplicate";
  const now = new Date();
  await prisma.$transaction([
    ...input.steps.map((step) => {
      const existing = film.steps.find((s) => s.maxWidthCm === step.maxWidthCm);
      return existing
        ? prisma.priceItem.update({ where: { id: existing.id }, data: { price: step.price, name: stepName(input.name, step.maxWidthCm), filmName: input.name } })
        : prisma.priceItem.create({ data: rowData(companyId, key, input.name, step) });
    }),
    ...film.steps
      .filter((s) => !input.steps.some((n) => n.maxWidthCm === s.maxWidthCm))
      .map((s) => prisma.priceItem.update({ where: { id: s.id }, data: { deletedAt: now } })),
  ]);
  return (await loadFilms(companyId)).find((f) => f.key === key)!;
}

export async function deleteFilm(companyId: string, key: string): Promise<boolean> {
  const res = await prisma.priceItem.updateMany({ where: { companyId, filmKey: key, deletedAt: null }, data: { deletedAt: new Date() } });
  return res.count > 0;
}
