/**
 * Цена полотна: один код для сайта и приложения.
 * ФАЙЛ-БЛИЗНЕЦ: potolok-ai-app/src/lib/shared/canvas-pricing.ts — держать идентичным.
 *
 * Основная лестница: каталог и свои строки мастера, считается сама по ширине.
 * Плёнка с лестницей (filmKey) считается только по выбору на объект или комнату.
 * В обоих случаях берётся самая узкая ступень, рулон которой не уже комнаты.
 */

export type CanvasCode = "canvas_320" | "canvas_550" | "canvas_over";

const CANVAS_ROLL_CM: Record<CanvasCode, number | null> = { canvas_320: 320, canvas_550: 550, canvas_over: null };
const CANVAS_CODES: CanvasCode[] = ["canvas_320", "canvas_550", "canvas_over"];

export type CanvasCatalog = Record<CanvasCode, { name: string; price: number; hidden?: boolean }>;

/** Своя строка основной лестницы. */
export interface CanvasRow {
  name: string;
  price: number;
  maxWidthCm?: number | null;
}

export interface FilmStep {
  id: string;
  /** Ширина рулона, см. null — любая ширина. */
  maxWidthCm: number | null;
  price: number;
}

export interface CanvasFilm {
  key: string;
  name: string;
  steps: FilmStep[];
}

/** Ширина комнаты для выбора ступени, см. Допуск 1 см: комната ровно 3,20 не уезжает в 5,5. */
export function canvasMinSideCm(widthM: number): number {
  return Math.round(widthM * 100 - 1);
}

/** Наименьшая «толщина» многоугольника поперёк его стен, в единицах координат. */
export function polygonMinThickness(points: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      const d = p.x * nx + p.y * ny;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    best = Math.min(best, hi - lo);
  }
  return best;
}

export interface MainCanvasPick<R extends CanvasRow> {
  code?: CanvasCode;
  row?: R;
  name: string;
  price: number;
}

/**
 * Основная лестница: среди видимых каталожных и своих строк самая узкая, чей рулон
 * перекрывает комнату. Иначе строка «любая ширина», иначе самая широкая.
 * Всё скрыто — по порогам каталога.
 */
export function pickMainCanvas<R extends CanvasRow>(minSideCm: number, catalog: CanvasCatalog, rows: R[]): MainCanvasPick<R> {
  type Candidate = MainCanvasPick<R> & { widthCm: number | null };
  const fromCode = (code: CanvasCode): Candidate => ({ code, name: catalog[code].name, price: catalog[code].price, widthCm: CANVAS_ROLL_CM[code] });
  const candidates: Candidate[] = [
    ...CANVAS_CODES.filter((code) => !catalog[code].hidden).map(fromCode),
    ...rows.map((row) => ({ row, name: row.name, price: row.price, widthCm: row.maxWidthCm ?? null })),
  ];
  const known = candidates.filter((c) => c.widthCm !== null).sort((a, b) => (a.widthCm as number) - (b.widthCm as number));
  const fits = known.find((c) => (c.widthCm as number) >= minSideCm);
  if (fits) return fits;
  const any = candidates.find((c) => c.widthCm === null);
  if (any) return any;
  if (known.length) return known[known.length - 1];
  return fromCode(minSideCm <= 320 ? "canvas_320" : minSideCm <= 550 ? "canvas_550" : "canvas_over");
}

/**
 * Ступень плёнки по ширине комнаты. Шире всех ступеней — «любая ширина», иначе
 * самая широкая, и тогда widest = true: мастер видит подсказку.
 */
export function pickFilmStep(film: CanvasFilm, minSideCm: number): { step: FilmStep; widest: boolean } | null {
  const known = film.steps.filter((s) => s.maxWidthCm !== null).sort((a, b) => (a.maxWidthCm as number) - (b.maxWidthCm as number));
  const fits = known.find((s) => (s.maxWidthCm as number) >= minSideCm);
  if (fits) return { step: fits, widest: false };
  const any = film.steps.find((s) => s.maxWidthCm === null);
  if (any) return { step: any, widest: false };
  return known.length ? { step: known[known.length - 1], widest: true } : null;
}
