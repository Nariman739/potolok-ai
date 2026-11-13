/**
 * Перенос полей комнаты, привязанных к НОМЕРАМ стен и углов, при правке стен
 * (Б5, 13.11.2026). До этого «Изменить стены» (мастер стен с editRoomId) оставлял
 * wallProfiles/wallFurniture/columns/obliqueDiagonals/elements.wallIndex со старыми
 * индексами (частичное слияние updateRoom), а SketchPad-рез переносил только
 * профили и фасады по совпадению ОБОИХ концов стены. Профили стен — деньги в КП.
 *
 * Чистые функции без React: их гоняет стенд scratchpad/reshape/stand.ts.
 *
 * Карта: для каждой НОВОЙ стены/угла — индекс старой (или null, если её больше нет).
 */
export interface Pt { x: number; y: number }

export interface WallMap {
  /** walls[newWall] = oldWall | null */
  walls: (number | null)[];
  /** corners[newCorner] = oldCorner | null; угол k — начало стены k. */
  corners: (number | null)[];
}

const near = (a: Pt, b: Pt, eps: number) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

/**
 * Геометрическое сопоставление (рез в SketchPad): стена «та же», если
 * (а) оба её конца совпали со старой, или (б) она лежит на той же прямой, что
 * старая, перекрывается с ней и делит хотя бы один конец — укороченная или
 * удлинённая резом стена наследует профиль (метраж в КП пересчитается по новой
 * длине, цена не хранится). Углы — по совпадению вершин.
 */
export function mapByGeometry(oldPoly: Pt[], newPoly: Pt[], eps = 1): WallMap {
  const n = newPoly.length, m = oldPoly.length;
  const corners: (number | null)[] = newPoly.map((v) => {
    const j = oldPoly.findIndex((u) => near(u, v, eps));
    return j >= 0 ? j : null;
  });
  const walls: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = newPoly[i], b = newPoly[(i + 1) % n];
    let found: number | null = null;
    // (а) оба конца
    for (let j = 0; j < m && found === null; j++) {
      const c = oldPoly[j], d = oldPoly[(j + 1) % m];
      if (near(a, c, eps) && near(b, d, eps)) found = j;
    }
    // (б) коллинеарна, перекрывается, общий конец
    for (let j = 0; j < m && found === null; j++) {
      const c = oldPoly[j], d = oldPoly[(j + 1) % m];
      const sharesEnd = near(a, c, eps) || near(b, d, eps) || near(a, d, eps) || near(b, c, eps);
      if (!sharesEnd) continue;
      const dx = d.x - c.x, dy = d.y - c.y;
      const len = Math.hypot(dx, dy);
      if (len < eps) continue;
      const cross = (p: Pt) => Math.abs((p.x - c.x) * dy - (p.y - c.y) * dx) / len;
      if (cross(a) > eps || cross(b) > eps) continue;
      // Проекции на старую стену: перекрытие положительной длины.
      const t = (p: Pt) => ((p.x - c.x) * dx + (p.y - c.y) * dy) / (len * len);
      const ta = t(a), tb = t(b);
      const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      if (Math.min(hi, 1) - Math.max(lo, 0) > eps / len) found = j;
    }
    walls.push(found);
  }
  return { walls, corners };
}

/**
 * Индексное сопоставление (мастер стен с editRoomId): геометрия здесь не годится —
 * изменил длину стены 1, и все вершины после неё сдвинулись. Мастер в этом режиме
 * меняет длины (та же стена), снимает стены ⌫ С КОНЦА и дорисовывает, либо
 * «дочертил сам» добавляет замыкающие в конец. Поэтому: число стен то же →
 * identity; длины совпали с развёрнутым обходом (sketch мог развернуть контур по
 * часовой) → зеркало i → n−1−i, углы k → (n−k) mod n; иначе — общий префикс.
 *
 * keptPrefix — сколько ПЕРВЫХ старых стен мастер не снимал (мастер знает это
 * сам: ⌫ убирает стену с конца). Без него по одним длинам «снял две стены и
 * нарисовал две другие» неотличимо от «поправил длины двух стен» — тогда
 * считаем, что число стен не изменилось = те же стены (identity).
 */
export function mapByIndex(oldWalls: number[], newWalls: number[], opts?: { keptPrefix?: number; tolCm?: number }): WallMap {
  const m = oldWalls.length, n = newWalls.length;
  const tolCm = opts?.tolCm ?? 1;
  const same = (a: number, b: number) => Math.abs(a - b) <= tolCm;
  if (m === n && n > 0 && opts?.keptPrefix === undefined) {
    const straight = oldWalls.every((w, i) => same(w, newWalls[i]));
    const mirrored = oldWalls.every((w, i) => same(w, newWalls[n - 1 - i]));
    if (mirrored && !straight) {
      return {
        walls: newWalls.map((_, i) => n - 1 - i),
        corners: newWalls.map((_, k) => (n - k) % n),
      };
    }
  }
  const keep = Math.min(opts?.keptPrefix ?? Math.min(m, n), m, n);
  return {
    walls: newWalls.map((_, i) => (i < keep ? i : null)),
    corners: newWalls.map((_, k) => (k < keep ? k : null)),
  };
}

/**
 * Сопоставление по НАПРАВЛЕНИЯМ стен (сайт, «Изменить стены» в веб-конструкторе,
 * ревью 8d 13.11.2026): там правят длины, и координаты всех вершин после правленной
 * стены сдвигаются — mapByGeometry снимала бы профиль соседней стены при 400×300 →
 * 401×300. Поэтому: число стен не изменилось → identity (решает вызывающий); число
 * изменилось (удалили/добавили выступ) → выравнивание последовательностей стен по
 * абсолютному направлению (накопленные повороты) с порядком, как diff/LCS: стена
 * «та же», если направление совпало и порядок сохранён; при выборе из нескольких
 * кандидатов предпочитаем ближайшую по длине (убрали выступ → правая стена 300 берёт
 * старую правую 300, а не стенку выступа 50 того же направления; верхняя стена, собранная
 * из частей, наследует самую длинную часть), при равенстве — более раннюю стену.
 * Углы — начало сопоставленной стены (та же вершина, пока стену не удлинили с начала).
 * turns — поворот ПОСЛЕ каждой стены в градусах (угол комнаты: 90 / −90 / свой).
 * Нумерация стен в обеих версиях должна начинаться с одной и той же стены (так в
 * веб-конструкторе); иначе направления сдвинуты и пар не будет — всё снято с предупреждением.
 */
export function mapByHeadings(
  oldWalls: number[], oldTurns: number[], newWalls: number[], newTurns: number[],
  opts?: { tolDeg?: number },
): WallMap {
  const tolDeg = opts?.tolDeg ?? 1;
  // Очки пары: направление совпало → 2000 + близость длин (0…1000; та же длина = 3000).
  // Целые — чтобы равные пути давали ровно равные суммы при обратном ходе.
  const pairScore = (i: number, k: number) => {
    const a = oldWalls[i], b = newWalls[k];
    return 2000 + Math.round(1000 * (1 - Math.abs(a - b) / Math.max(a, b, 1)));
  };
  const headings = (walls: number[], turns: number[]) => {
    const h: number[] = []; let a = 0;
    for (let i = 0; i < walls.length; i++) { h.push(((a % 360) + 360) % 360); a += turns[i] ?? 90; }
    return h;
  };
  const ho = headings(oldWalls, oldTurns), hn = headings(newWalls, newTurns);
  const m = oldWalls.length, n = newWalls.length;
  const sameDir = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) <= tolDeg; };
  // DP: score[i][k] — лучшее выравнивание old[0..i) и new[0..k).
  const score: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let k = 1; k <= n; k++) {
      const match = sameDir(ho[i - 1], hn[k - 1]) ? pairScore(i - 1, k - 1) : 0;
      score[i][k] = Math.max(score[i - 1][k], score[i][k - 1], match ? score[i - 1][k - 1] + match : 0);
    }
  }
  const walls: (number | null)[] = new Array(n).fill(null);
  let i = m, k = n;
  // Обратный ход с конца: пока пропуск не теряет очков — пропускаем (так пара
  // достаётся САМОЙ РАННЕЙ из равнозначных стен), пару берём только когда без неё хуже.
  while (i > 0 && k > 0) {
    if (score[i - 1][k] === score[i][k]) i--;
    else if (score[i][k - 1] === score[i][k]) k--;
    else { walls[k - 1] = i - 1; i--; k--; }
  }
  return { walls, corners: [...walls] };
}

/** Минимум полей комнаты, которые индексированы по стенам/углам (SavedRoom в приложении, MeasurementRoom на сайте). */
export interface IndexedRoomFields<P = unknown, F extends { wall: number } = { wall: number }, C extends { corner: number } = { corner: number }, E extends { wallIndex?: number } = { wallIndex?: number }> {
  wallProfiles?: Record<number, P>;
  wallFurniture?: F[];
  columns?: C[];
  obliqueDiagonals?: { from: number; to: number; length: number }[];
  measureDiagonals?: number[];
  elements?: E[];
}

export interface RemapDropped {
  /** Старые номера стен, чей профиль/фасад снят (стены больше нет). */
  profiles: number[];
  furniture: number[];
  columns: number;
  obliqueDiagonals: number;
  /** Элементы (гардина и т.п.), отвязанные от исчезнувшей стены — остались на чертеже свободными. */
  wallElements: number;
  measureDiagonals: boolean;
}

export function remapDroppedTotal(d: RemapDropped): number {
  return d.profiles.length + d.furniture.length + d.columns + d.obliqueDiagonals + d.wallElements + (d.measureDiagonals ? 1 : 0);
}

/**
 * Применяет карту ко всем индексированным полям. Возвращает патч (поля заданы
 * ЯВНО, в том числе undefined/пустые — чтобы частичное слияние не оставляло
 * хвостов) и перечень снятого — для одного понятного Alert мастеру.
 */
export function remapRoomIndexed<P, F extends { wall: number }, C extends { corner: number }, E extends { wallIndex?: number }>(
  room: IndexedRoomFields<P, F, C, E>,
  map: WallMap,
  opts: { dropMeasureDiagonals: boolean },
): { patch: IndexedRoomFields<P, F, C, E>; dropped: RemapDropped } {
  const oldToNewWall = new Map<number, number>();
  map.walls.forEach((oldIdx, newIdx) => { if (oldIdx !== null && !oldToNewWall.has(oldIdx)) oldToNewWall.set(oldIdx, newIdx); });
  const oldToNewCorner = new Map<number, number>();
  map.corners.forEach((oldIdx, newIdx) => { if (oldIdx !== null && !oldToNewCorner.has(oldIdx)) oldToNewCorner.set(oldIdx, newIdx); });
  const dropped: RemapDropped = { profiles: [], furniture: [], columns: 0, obliqueDiagonals: 0, wallElements: 0, measureDiagonals: false };

  let wallProfiles: Record<number, P> | undefined;
  if (room.wallProfiles) {
    const out: Record<number, P> = {};
    for (const [k, v] of Object.entries(room.wallProfiles)) {
      const oldIdx = Number(k);
      const next = oldToNewWall.get(oldIdx);
      if (next !== undefined) out[next] = v as P; else dropped.profiles.push(oldIdx);
    }
    wallProfiles = Object.keys(out).length > 0 ? out : undefined;
  }

  let wallFurniture: F[] | undefined;
  if (room.wallFurniture?.length) {
    const out: F[] = [];
    for (const f of room.wallFurniture) {
      const next = oldToNewWall.get(f.wall);
      if (next !== undefined) out.push({ ...f, wall: next }); else dropped.furniture.push(f.wall);
    }
    wallFurniture = out.length > 0 ? out : undefined;
  }

  let columns: C[] | undefined;
  if (room.columns?.length) {
    const out: C[] = [];
    for (const c of room.columns) {
      const next = oldToNewCorner.get(c.corner);
      if (next !== undefined) out.push({ ...c, corner: next }); else dropped.columns += 1;
    }
    columns = out;
  }

  let obliqueDiagonals: { from: number; to: number; length: number }[] | undefined;
  if (room.obliqueDiagonals?.length) {
    const out: { from: number; to: number; length: number }[] = [];
    for (const d of room.obliqueDiagonals) {
      const from = oldToNewCorner.get(d.from), to = oldToNewCorner.get(d.to);
      if (from !== undefined && to !== undefined && from !== to) out.push({ ...d, from, to }); else dropped.obliqueDiagonals += 1;
    }
    obliqueDiagonals = out.length > 0 ? out : undefined;
  }

  let measureDiagonals = room.measureDiagonals;
  if (opts.dropMeasureDiagonals && room.measureDiagonals?.length) {
    measureDiagonals = undefined;
    dropped.measureDiagonals = true;
  }

  let elements = room.elements;
  if (room.elements?.some((e) => typeof e.wallIndex === "number")) {
    elements = room.elements.map((e) => {
      if (typeof e.wallIndex !== "number") return e;
      const next = oldToNewWall.get(e.wallIndex);
      if (next !== undefined) return { ...e, wallIndex: next };
      dropped.wallElements += 1;
      const { wallIndex: _drop, ...rest } = e;
      return rest as E;
    });
  }

  return { patch: { wallProfiles, wallFurniture, columns, obliqueDiagonals, measureDiagonals, elements }, dropped };
}
