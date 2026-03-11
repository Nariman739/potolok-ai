// Vision system for reading handwritten ceiling measurement sketches
// Architecture:
//   1. ONE AI agent reads the photo → extracts rooms + wall lengths in clockwise order
//   2. Rectilinear polygon solver calculates area from wall lengths (all angles = 90°)
//   3. Perimeter = sum of walls (trivial)
//
// The solver tries all possible turn sequences and finds the one that closes the polygon.
// For 6 walls: 6 attempts. For 8 walls: 28 attempts. Instant.

import { getOpenRouter, VISION_MODEL } from "@/lib/openrouter";

// ─────────────────────────────────────────────────────
// AI prompt — ONLY reads numbers, NO math
// ─────────────────────────────────────────────────────

const MEASUREMENT_READER_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

## ТВОЯ ЕДИНСТВЕННАЯ ЗАДАЧА
Прочитай с фото ВСЕ комнаты и ВСЕ размеры стен. Ничего не считай.

## АЛГОРИТМ

1. Найди ВСЕ замкнутые фигуры на чертеже. Каждая = одна комната.
   НЕ пропускай маленькие (кладовки, санузлы, коридоры, балконы).

2. Для каждой комнаты:
   a) Прочитай ВСЕ числа у стен — КАЖДАЯ сторона контура имеет размер.
      Маленькие числа (9, 22, 45, 66, 93) тоже стены — не пропускай!

   b) Запиши стены В ПОРЯДКЕ ОБХОДА ПО ЧАСОВОЙ СТРЕЛКЕ, начиная с верхней стены.
      Обход: верхняя → правая → нижняя → левая (для прямоугольника).
      Для сложных форм: иди по контуру по часовой стрелке, записывая каждую стену.

   c) Посчитай количество УГЛОВ (вершин) фигуры.
      Прямоугольник = 4. Г-образная = 6. П-образная = 8.

3. ЕДИНИЦЫ: числа на чертеже — САНТИМЕТРЫ.
   139 = 139 см, 464 = 464 см, 45 = 45 см, 9 = 9 см.
   Верни в САНТИМЕТРАХ (целые числа). НЕ переводи в метры.

4. P= и S= на чертеже — ИГНОРИРУЙ полностью. Не используй эти значения.

## ФОРМАТ ОТВЕТА (только JSON, ничего больше):
\`\`\`json
{
  "rooms": [
    {
      "id": 1,
      "name": "Помещение 1",
      "walls_cm": [464, 246, 464, 246],
      "corners": 4
    },
    {
      "id": 2,
      "name": "Помещение 2",
      "walls_cm": [340, 105, 139, 134, 201, 239],
      "corners": 6
    }
  ],
  "total_rooms": 2
}
\`\`\`

## ПРАВИЛА
- walls_cm — стены В ПОРЯДКЕ обхода по часовой стрелке, начиная с верхней
- corners — количество углов (вершин) фигуры = количество стен
- Количество элементов walls_cm ДОЛЖНО совпадать с corners
- Прямоугольник: ровно 4 стены [верх, право, низ, лево]
- Если на чертеже есть названия комнат — используй их
- НЕ считай площадь, периметр, ничего — только читай числа с фото
- Все углы в комнатах = 90° (это стандарт для квартир)`;

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface AIRoomReading {
  id: number;
  name: string;
  walls_cm: number[];
  corners: number;
}

interface AIReadingResult {
  rooms: AIRoomReading[];
  total_rooms: number;
}

export interface MergedRoom {
  id: number;
  name: string;
  corners: number;
  walls: number[];       // meters
  walls_cm: number[];    // original cm
  perimeter: number;     // meters, calculated by code
  area: number;          // m², calculated by code
  areaMethod: string;    // how area was calculated (for debugging)
}

export interface MultiAgentResult {
  rooms: MergedRoom[];
  totalRooms: number;
  totalCorners: number;
  totalPerimeter: number;
  totalArea: number;
}

// ─────────────────────────────────────────────────────
// Call the single vision agent
// ─────────────────────────────────────────────────────
async function callVisionAgent(imageBase64Url: string): Promise<string> {
  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: MEASUREMENT_READER_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Прочитай все размеры с этого чертежа замеров." },
          { type: "image_url", image_url: { url: imageBase64Url } },
        ],
      },
    ],
    stream: false,
    max_tokens: 2000,
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
// Given wall lengths in clockwise order (all angles 90°),
// determines the correct turn sequence and calculates area.
// ─────────────────────────────────────────────────────

// Direction vectors: 0=right(+x), 1=down(+y), 2=left(-x), 3=up(-y)
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Try a specific set of reflex (left-turn) vertex indices.
 * Returns area if polygon closes, null otherwise.
 */
function tryTurnSequence(
  walls: number[],
  reflexIndices: Set<number>
): { area: number; vertices: { x: number; y: number }[] } | null {
  const n = walls.length;
  let x = 0, y = 0, dir = 0; // start at origin, heading right
  const vertices: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    vertices.push({ x, y });
    // Move in current direction
    x += DX[dir] * walls[i];
    y += DY[dir] * walls[i];
    // Turn at next vertex
    const nextVertex = (i + 1) % n;
    if (reflexIndices.has(nextVertex)) {
      dir = (dir + 3) % 4; // left turn (reflex, 270° interior)
    } else {
      dir = (dir + 1) % 4; // right turn (convex, 90° interior)
    }
  }

  // Check closure (must return to origin)
  const TOLERANCE = 0.5; // 0.5 cm tolerance
  if (Math.abs(x) > TOLERANCE || Math.abs(y) > TOLERANCE) {
    return null;
  }

  // Shoelace formula for area
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  const area = Math.abs(sum) / 2;

  // Basic self-intersection check: area should be positive and reasonable
  if (area < 1) return null; // less than 1 cm² = invalid

  return { area, vertices };
}

/**
 * Generate all combinations of k items from n (C(n,k))
 */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];

  function generate(start: number, remaining: number) {
    if (remaining === 0) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= n - remaining; i++) {
      combo.push(i);
      generate(i + 1, remaining - 1);
      combo.pop();
    }
  }

  generate(0, k);
  return result;
}

/**
 * Solve rectilinear polygon: find area from wall lengths (all 90° angles).
 * For n walls traversed clockwise:
 *   - Number of right turns (convex): n/2 + 2
 *   - Number of left turns (reflex): n/2 - 2
 * Try all possible placements of reflex vertices, check which ones close.
 */
function solveRectilinearArea(walls_cm: number[]): { area_m2: number; method: string } {
  const n = walls_cm.length;

  // Rectangle: trivial
  if (n === 4) {
    const a = walls_cm[0];
    const b = walls_cm[1];
    return {
      area_m2: Math.round((a * b) / 100) / 100,
      method: `rectangle ${a}×${b}cm`,
    };
  }

  // For n walls, we need n/2 - 2 reflex vertices
  if (n % 2 !== 0) {
    // Odd number of walls — can't be a rectilinear polygon
    return { area_m2: 0, method: "odd walls — unsupported" };
  }

  const numReflex = n / 2 - 2;

  if (numReflex < 0) {
    return { area_m2: 0, method: "too few walls" };
  }

  if (numReflex === 0) {
    // Rectangle (already handled above for n=4, but just in case)
    const result = tryTurnSequence(walls_cm, new Set());
    if (result) {
      return {
        area_m2: Math.round(result.area / 100) / 100,
        method: "convex polygon",
      };
    }
    return { area_m2: 0, method: "convex polygon — didn't close" };
  }

  // Try all combinations of reflex vertex positions
  const combos = combinations(n, numReflex);
  const validResults: { area: number; reflexSet: number[] }[] = [];

  for (const combo of combos) {
    const reflexSet = new Set(combo);
    const result = tryTurnSequence(walls_cm, reflexSet);
    if (result) {
      validResults.push({ area: result.area, reflexSet: combo });
    }
  }

  if (validResults.length === 0) {
    // No valid turn sequence found — polygon can't close with these walls
    // Fallback: try estimating from walls (assume roughly rectangular)
    return { area_m2: 0, method: `no valid polygon found (${combos.length} tried)` };
  }

  if (validResults.length === 1) {
    return {
      area_m2: Math.round(validResults[0].area / 100) / 100,
      method: `unique solution, reflex=[${validResults[0].reflexSet}]`,
    };
  }

  // Multiple valid polygons — pick the largest (most likely the real room)
  validResults.sort((a, b) => b.area - a.area);
  return {
    area_m2: Math.round(validResults[0].area / 100) / 100,
    method: `${validResults.length} solutions, picked largest, reflex=[${validResults[0].reflexSet}]`,
  };
}

// ─────────────────────────────────────────────────────
// Perimeter (trivial: sum of walls)
// ─────────────────────────────────────────────────────
function calculatePerimeter(walls_cm: number[]): number {
  const total_cm = walls_cm.reduce((sum, w) => sum + Math.abs(w), 0);
  return Math.round(total_cm) / 100;
}

// ─────────────────────────────────────────────────────
// Main: run vision agent + calculate with solver
// ─────────────────────────────────────────────────────
export async function runVisionAgents(imageBase64Url: string): Promise<MultiAgentResult> {
  const raw = await callVisionAgent(imageBase64Url);
  console.log("[Vision Agent] Reading:", raw.slice(0, 500));

  const data = extractJson(raw) as AIReadingResult;

  const merged: MergedRoom[] = [];

  for (const room of data.rooms) {
    const walls_m = room.walls_cm.map(cm => Math.round(Math.abs(cm)) / 100);
    const perimeter = calculatePerimeter(room.walls_cm);
    const corners = room.corners || room.walls_cm.length;

    // Solve area using rectilinear polygon algorithm
    const { area_m2, method } = solveRectilinearArea(room.walls_cm);

    console.log(`[Solver] ${room.name}: walls=[${room.walls_cm}] → area=${area_m2}m², method=${method}`);

    merged.push({
      id: room.id,
      name: room.name,
      corners,
      walls: walls_m,
      walls_cm: room.walls_cm,
      perimeter,
      area: area_m2,
      areaMethod: method,
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
