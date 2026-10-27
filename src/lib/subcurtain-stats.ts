/**
 * Геометрия подшторника (сторона комнаты, длины, скрытые углы). Чистые функции
 * без React — вынесены из клиентского room-designer.tsx 27.10.2026: серверный
 * роут recalc-room импортировал их оттуда и в Next 16/Turbopack получал
 * client reference → «Attempted to call getVertices() from the server» (500
 * у Ирины при правке комнаты из КП).
 */

interface Vertex { x: number; y: number }

/**
 * Определяет «сторону» комнаты для подшторника при drag-drop / превью / кнопке
 * «Через выступы». Расширяет span влево и вправо от стартовой стены, пока
 * соседняя стена смотрит примерно в ту же сторону, что и стартовая (центр
 * соседней по проекции на нормаль стартовой ≤ THRESHOLD_CM).
 *
 * Это работает и для коротких выступов, и для длинных параллельных стен:
 *   правая сторона = 14 + 28 + 134 + 14 + 131 → span от верхнего угла до нижнего.
 */
export function computeSubcurtainSpan(
  startWallIdx: number,
  vertices: Vertex[],
  N: number,
  walls?: number[]
): { leftWall: number; rightWall: number } {
  // Если стартовая стена очень короткая (выступ), берём её соседку
  // подлиннее как опорную — иначе нормаль будет от выступа,
  // и соседние длинные стены не пройдут по `sameSide`.
  let anchorIdx = startWallIdx;
  if (walls && (walls[startWallIdx] || 0) < 50) {
    const candidates = [
      (startWallIdx - 1 + N) % N,
      (startWallIdx + 1) % N,
      (startWallIdx - 2 + N) % N,
      (startWallIdx + 2) % N,
    ];
    let bestLen = walls[startWallIdx] || 0;
    for (const c of candidates) {
      const cl = walls[c] || 0;
      if (cl > bestLen) {
        bestLen = cl;
        anchorIdx = c;
      }
    }
  }
  const v1 = vertices[anchorIdx], v2 = vertices[anchorIdx + 1];
  if (!v1 || !v2) return { leftWall: startWallIdx, rightWall: startWallIdx };
  const dx = v2.x - v1.x, dy = v2.y - v1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nrmX = -dy / len, nrmY = dx / len;
  const startMidX = (v1.x + v2.x) / 2;
  const startMidY = (v1.y + v2.y) / 2;
  const startProj = startMidX * nrmX + startMidY * nrmY;
  const THRESHOLD_CM = 100;

  function sameSide(idx: number): boolean {
    const a = vertices[idx], b = vertices[idx + 1];
    if (!a || !b) return false;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const proj = mx * nrmX + my * nrmY;
    return Math.abs(proj - startProj) < THRESHOLD_CM;
  }

  // Расширяем от опоры (anchor), а не от точки клика — иначе короткий выступ
  // может оборвать расширение на одну сторону.
  let leftWall = anchorIdx;
  for (let k = 0; k < N; k++) {
    const prev = (leftWall - 1 + N) % N;
    if (prev === anchorIdx) break;
    if (sameSide(prev)) leftWall = prev;
    else break;
  }
  let rightWall = anchorIdx;
  for (let k = 0; k < N; k++) {
    const next = (rightWall + 1) % N;
    if (next === anchorIdx) break;
    if (sameSide(next)) rightWall = next;
    else break;
  }
  return { leftWall, rightWall };
}

/**
 * Расширенная статистика по подшторникам.
 *
 * Поддерживает обе модели:
 * - **Single-anchor (текущая)**: `length` напрямую, `coveredCorners` выводится
 *   через `computeSubcurtainSpan(wallIndex)` (нужны `walls`).
 * - **Legacy span**: для старых данных из DB с `spanFromVertex/spanToVertex`
 *   берётся прямая между вершинами, считаются углы внутри.
 *
 * Параметр `walls` опционален для обратной совместимости с вызывающим кодом,
 * но без него `coveredCorners` не считается для прямого подшторника
 * с canonical-данными (через side нельзя пройти без знания длин стен).
 */
export function computeSubcurtainStats(
  elements: { type: string; length?: number; shape?: string; depth?: number; spanFromVertex?: number; spanToVertex?: number; wallIndex?: number }[],
  vertices: { x: number; y: number }[],
  wallsCount: number,
  walls?: number[]
): { totalLengthCm: number; onWallLengthCm: number; coveredCorners: number } {
  let totalLengthCm = 0;
  let onWallLengthCm = 0;
  let coveredCorners = 0;
  for (const e of elements) {
    if (e.type !== "subcurtain") continue;

    // Legacy span-данные (старые комнаты из DB).
    const fromV = e.spanFromVertex;
    const toV = e.spanToVertex;
    if (fromV !== undefined && toV !== undefined && vertices[fromV] && vertices[toV]) {
      const a = vertices[fromV], b = vertices[toV];
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      totalLengthCm += span;
      onWallLengthCm += span;
      let walked = 0;
      let cur = fromV;
      while (cur !== toV && walked < wallsCount) {
        cur = (cur + 1) % wallsCount;
        walked++;
      }
      coveredCorners += Math.max(0, walked - 1);
      continue;
    }

    // Canonical модель (single-anchor + niche).
    const len = e.length || 0;
    onWallLengthCm += len;
    if (e.shape === "u-niche" && e.depth) totalLengthCm += len + 2 * e.depth;
    else if (e.shape === "l-bend" && e.depth) totalLengthCm += len + e.depth;
    else totalLengthCm += len;

    // Прямой подшторник: углы стороны, скрытые линией = (стен в стороне − 1).
    const isStraight = e.shape !== "u-niche" && e.shape !== "l-bend";
    if (isStraight && walls && e.wallIndex !== undefined && wallsCount > 0) {
      const span = computeSubcurtainSpan(e.wallIndex, vertices as Vertex[], wallsCount, walls);
      const wallsInSide = ((span.rightWall - span.leftWall + wallsCount) % wallsCount) + 1;
      coveredCorners += Math.max(0, wallsInSide - 1);
    }
  }
  return { totalLengthCm, onWallLengthCm, coveredCorners };
}
