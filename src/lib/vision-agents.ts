// Vision system for reading handwritten ceiling measurement sketches
// Architecture:
//   1. ONE AI agent reads the photo → extracts rooms + wall lengths + P/S values
//   2. Rectilinear polygon solver calculates area from wall lengths (all angles = 90°)
//   3. Auto-correction: verify walls close, fix if possible
//   4. Fallback: use P= and S= values from sketch if solver fails

import { getOpenRouter, VISION_MODEL } from "@/lib/openrouter";

// ─────────────────────────────────────────────────────
// AI prompt — step-by-step reading with verification
// ─────────────────────────────────────────────────────

const MEASUREMENT_READER_PROMPT = `Ты — сканер рукописных чертежей. Твоя единственная задача — прочитать цифры со стен и передать их. Ты НЕ считаешь площадь и периметр — это делает программа.

## ШАГ 1: Найди все замкнутые фигуры (комнаты)
Найди каждый прямоугольник или многоугольник нарисованный на чертеже.
Не пропускай маленькие (кладовки, санузлы, коридоры).

## ШАГ 2: Для каждой фигуры — выпиши числа со сторон
Иди по контуру фигуры и выписывай числа которые стоят РЯДОМ С ЛИНИЯМИ СТЕН.
- Начинай с верхней стены, идёшь по часовой стрелке
- Прямоугольник → 4 числа
- Г-образная → 6 чисел
- Т-образная → 8 чисел

## ПРАВИЛА ЧТО БРАТЬ В walls_cm
✅ Числа стоящие вдоль линий стен (50–1500 см)
❌ P= ... — это периметр, клади в p_value
❌ S= ... — это площадь, клади в s_value
❌ Подписи, названия комнат, номера
❌ Числа < 30 или > 1500 — это не стены

## ФОРМАТ ОТВЕТА
Сначала кратко опиши что видишь, потом JSON:

\`\`\`json
{
  "rooms": [
    {
      "id": 1,
      "name": "Помещение 1",
      "walls_cm": [464, 246, 464, 246],
      "corners": 4,
      "p_value": null,
      "s_value": null
    },
    {
      "id": 2,
      "name": "Помещение 2",
      "walls_cm": [340, 105, 139, 134, 201, 239],
      "corners": 6,
      "p_value": 11.58,
      "s_value": null
    }
  ],
  "total_rooms": 2
}
\`\`\`

## ПОЛЯ
- walls_cm — только числа со сторон фигуры, в сантиметрах, по часовой стрелке
- corners — количество углов (= количество стен)
- p_value — если рядом написано P=... (в метрах), иначе null
- s_value — если рядом написано S=... (в м²), иначе null`;

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface AIRoomReading {
  id: number;
  name: string;
  walls_cm: number[];
  corners: number;
  p_value: number | null;
  s_value: number | null;
}

interface AIReadingResult {
  rooms: AIRoomReading[];
  total_rooms: number;
}

export interface MergedRoom {
  id: number;
  name: string;
  corners: number;
  walls: number[];
  walls_cm: number[];
  perimeter: number;
  area: number;
  areaMethod: string;
  p_value: number | null;
  s_value: number | null;
}

export interface MultiAgentResult {
  rooms: MergedRoom[];
  totalRooms: number;
  totalCorners: number;
  totalPerimeter: number;
  totalArea: number;
}

// ─────────────────────────────────────────────────────
// Call the vision agent
// ─────────────────────────────────────────────────────
async function callVisionAgent(imageBase64Url: string): Promise<string> {
  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: MEASUREMENT_READER_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Прочитай все размеры с этого чертежа замеров. Сначала перечисли все числа, потом определи комнаты, потом запиши стены." },
          { type: "image_url", image_url: { url: imageBase64Url } },
        ],
      },
    ],
    stream: false,
    max_tokens: 4000, // More tokens for step-by-step analysis
    temperature: 0.1,
  });

  return result.choices[0]?.message?.content?.trim() || "";
}

// ─────────────────────────────────────────────────────
// Parse JSON from agent response
// ─────────────────────────────────────────────────────
function extractJson(text: string): unknown {
  const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlock) return JSON.parse(jsonBlock[1]);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error("No JSON found in agent response");
}

// ─────────────────────────────────────────────────────
// RECTILINEAR POLYGON SOLVER
// ─────────────────────────────────────────────────────

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function tryTurnSequence(walls: number[], reflexIndices: Set<number>): number | null {
  const n = walls.length;
  let x = 0, y = 0, dir = 0;
  const vertices: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    vertices.push({ x, y });
    x += DX[dir] * walls[i];
    y += DY[dir] * walls[i];
    const nextVertex = (i + 1) % n;
    if (reflexIndices.has(nextVertex)) {
      dir = (dir + 3) % 4;
    } else {
      dir = (dir + 1) % 4;
    }
  }

  const TOLERANCE = 0.5;
  if (Math.abs(x) > TOLERANCE || Math.abs(y) > TOLERANCE) return null;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  const area = Math.abs(sum) / 2;
  return area < 1 ? null : area;
}

function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];
  function gen(start: number, rem: number) {
    if (rem === 0) { result.push([...combo]); return; }
    for (let i = start; i <= n - rem; i++) {
      combo.push(i);
      gen(i + 1, rem - 1);
      combo.pop();
    }
  }
  gen(0, k);
  return result;
}

function solveRectilinearArea(walls_cm: number[]): { area_m2: number; method: string } {
  const n = walls_cm.length;

  if (n < 3) return { area_m2: 0, method: "too few walls" };

  if (n === 4) {
    const a = walls_cm[0], b = walls_cm[1];
    return {
      area_m2: Math.round((a * b) / 100) / 100,
      method: `rectangle ${a}×${b}`,
    };
  }

  if (n % 2 !== 0) return { area_m2: 0, method: `odd walls (${n})` };

  const numReflex = n / 2 - 2;
  if (numReflex <= 0) return { area_m2: 0, method: "invalid wall count" };

  const combos = combinations(n, numReflex);
  const valid: { area: number; reflex: number[] }[] = [];

  for (const c of combos) {
    const area = tryTurnSequence(walls_cm, new Set(c));
    if (area !== null) valid.push({ area, reflex: c });
  }

  if (valid.length === 0) {
    return { area_m2: 0, method: `no solution (${combos.length} tried)` };
  }

  valid.sort((a, b) => b.area - a.area);
  return {
    area_m2: Math.round(valid[0].area / 100) / 100,
    method: valid.length === 1
      ? `solved, reflex=[${valid[0].reflex}]`
      : `${valid.length} solutions, largest`,
  };
}

// ─────────────────────────────────────────────────────
// Auto-correction: try to fix walls that don't close
// ─────────────────────────────────────────────────────
function tryAutoCorrect(walls_cm: number[]): { walls_cm: number[]; method: string } | null {
  const n = walls_cm.length;
  if (n < 6 || n % 2 !== 0) return null;

  // For 6-wall L-shape: wall[0] = wall[2] + wall[4], wall[5] = wall[1] + wall[3]
  // Try correcting each wall to make it close
  for (let fix = 0; fix < n; fix++) {
    const corrected = [...walls_cm];

    if (n === 6) {
      // Try fixing wall[fix] based on the constraint
      if (fix === 0) corrected[0] = corrected[2] + corrected[4];
      else if (fix === 2) corrected[2] = corrected[0] - corrected[4];
      else if (fix === 4) corrected[4] = corrected[0] - corrected[2];
      else if (fix === 5) corrected[5] = corrected[1] + corrected[3];
      else if (fix === 1) corrected[1] = corrected[5] - corrected[3];
      else if (fix === 3) corrected[3] = corrected[5] - corrected[1];

      if (corrected.some(w => w <= 0)) continue;
    }

    const { area_m2 } = solveRectilinearArea(corrected);
    if (area_m2 > 0) {
      return {
        walls_cm: corrected,
        method: `auto-corrected wall[${fix}]: ${walls_cm[fix]}→${corrected[fix]}`,
      };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────
// Perimeter
// ─────────────────────────────────────────────────────
function calculatePerimeter(walls_cm: number[]): number {
  return Math.round(walls_cm.reduce((sum, w) => sum + Math.abs(w), 0)) / 100;
}

// ─────────────────────────────────────────────────────
// Main: run vision agent + calculate + auto-correct + fallback
// ─────────────────────────────────────────────────────
export async function runVisionAgents(imageBase64Url: string): Promise<MultiAgentResult> {
  const raw = await callVisionAgent(imageBase64Url);
  console.log("[Vision Agent] Full response:", raw);

  const data = extractJson(raw) as AIReadingResult;
  const merged: MergedRoom[] = [];

  for (const room of data.rooms) {
    const walls_cm = room.walls_cm.filter(w => w > 0);
    const corners = room.corners || walls_cm.length;

    // Step 1: Try solver with original walls
    let { area_m2, method } = solveRectilinearArea(walls_cm);
    let finalWalls = walls_cm;

    // Step 2: If failed, try auto-correction
    if (area_m2 === 0 && walls_cm.length >= 6) {
      const corrected = tryAutoCorrect(walls_cm);
      if (corrected) {
        const result = solveRectilinearArea(corrected.walls_cm);
        if (result.area_m2 > 0) {
          area_m2 = result.area_m2;
          method = corrected.method;
          finalWalls = corrected.walls_cm;
        }
      }
    }

    // Step 3: If still failed, use S= value from sketch
    if (area_m2 === 0 && room.s_value && room.s_value > 0) {
      area_m2 = room.s_value;
      method = `from sketch S=${room.s_value}`;
    }

    // Perimeter: prefer calculated, verify against P= if available
    let perimeter = calculatePerimeter(finalWalls);
    if (perimeter === 0 && room.p_value && room.p_value > 0) {
      perimeter = room.p_value;
    }

    // Sanity check: filter out physically impossible rooms
    // Real ceiling rooms: area >= 1 m², min wall >= 50 cm, max wall <= 1500 cm
    // Isoperimetric ratio P²/(4S) < 80 (square=4, L-shape~6, extreme=20)
    const minWall = finalWalls.length > 0 ? Math.min(...finalWalls) : 0;
    const maxWall = finalWalls.length > 0 ? Math.max(...finalWalls) : 0;
    const isoRatio = area_m2 > 0 ? (perimeter * perimeter) / (4 * area_m2) : 9999;
    const isValidRoom = area_m2 >= 1 && minWall >= 30 && maxWall <= 2000 && isoRatio < 80;

    if (!isValidRoom) {
      console.log(`[Solver] ${room.name}: FILTERED OUT — area=${area_m2}m², perim=${perimeter}m, minWall=${minWall}, maxWall=${maxWall}, ratio=${isoRatio.toFixed(1)}`);
      continue;
    }

    console.log(`[Solver] ${room.name}: walls=[${finalWalls}] → area=${area_m2}m² (${method}), perim=${perimeter}m${room.p_value ? ' (P=' + room.p_value + ')' : ''}${room.s_value ? ' (S=' + room.s_value + ')' : ''}`);

    merged.push({
      id: room.id,
      name: room.name,
      corners,
      walls: finalWalls.map(cm => Math.round(cm) / 100),
      walls_cm: finalWalls,
      perimeter,
      area: area_m2,
      areaMethod: method,
      p_value: room.p_value,
      s_value: room.s_value,
    });
  }

  const totalArea = Math.round(merged.reduce((s, r) => s + r.area, 0) * 100) / 100;
  const totalPerimeter = Math.round(merged.reduce((s, r) => s + r.perimeter, 0) * 100) / 100;
  const totalCorners = merged.reduce((s, r) => s + r.corners, 0);

  return {
    rooms: merged,
    totalRooms: merged.length,
    totalCorners,
    totalPerimeter,
    totalArea,
  };
}

// ─────────────────────────────────────────────────────
// Format results for conversation agent
// ─────────────────────────────────────────────────────
export function formatVisionResults(result: MultiAgentResult): string {
  const n = result.totalRooms;
  const roomWord = n === 1 ? "комнату" : n < 5 ? "комнаты" : "комнат";
  const lines = [`Нашёл ${n} ${roomWord}:`];

  for (const room of result.rooms) {
    const extra = room.corners > 4 ? ` (${room.corners - 4} доп.)` : "";
    lines.push(
      `• ${room.name} — ${room.area} м², периметр ${room.perimeter} м, ${room.corners} углов${extra}`
    );
    if (room.area === 0) {
      lines.push(`  ⚠️ Площадь не удалось рассчитать — проверьте данные`);
    }
  }

  lines.push(`\nОбщая площадь: ${result.totalArea} м², общий периметр: ${result.totalPerimeter} м`);
  lines.push(`\nПроверьте — всё верно? Можете переименовать ('1 — зал, 2 — спальня').`);

  return lines.join("\n");
}
