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

const MEASUREMENT_READER_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

## ЗАДАЧА
Прочитай ВСЕ размеры с фото. Действуй пошагово.

## ШАГ 1: Перечисли ВСЕ числа на фото
Выпиши каждое число которое видишь, с описанием позиции.
Формат: "число (где на фото)"
Пример: "464 (верхняя стена большой комнаты), P=18.33 (подпись слева), 139 (маленькая стена справа)"
⚠️ Маленькие числа (9, 22, 45, 66) тоже стены!
⚠️ Числа с P= или S= — это периметр/площадь, написанные мастером.

## ШАГ 2: Определи комнаты
Найди ВСЕ замкнутые фигуры. НЕ пропускай маленькие (кладовки, санузлы, коридоры).
Для каждой: опиши форму (прямоугольник, Г-образная, и т.д.) и какие числа к ней относятся.

## ШАГ 3: Для каждой комнаты запиши стены
Иди по контуру ПО ЧАСОВОЙ СТРЕЛКЕ, начиная с ВЕРХНЕЙ стены.
- Прямоугольник: [верх, право, низ, лево] — 4 стены
- Г-образная: 6 стен по контуру
- Любая форма: все стены по контуру

## ШАГ 4: Проверка
Для Г-образной (6 стен): стена[0] должна = стена[2] + стена[4] (горизонтали балансируются)
Для прямоугольника: стена[0] = стена[2], стена[1] = стена[3]
Если не сходится — перепроверь какие числа к какой стене относятся.

## ЕДИНИЦЫ
- Целые числа (139, 464, 45) — это САНТИМЕТРЫ
- P=18.33, S=3.8 — это уже в МЕТРАХ (не трогай, верни как есть)

## ФОРМАТ ОТВЕТА
Сначала выведи анализ (шаги 1-4), потом JSON:

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
- walls_cm — стены в САНТИМЕТРАХ, по часовой стрелке с верхней
- corners — количество стен = количество углов
- p_value — значение P= если написано рядом с комнатой (в метрах), иначе null
- s_value — значение S= если написано рядом с комнатой (в м²), иначе null

## КРИТИЧЕСКИ ВАЖНО
- Каждое число на чертеже = одна стена. Не пропускай!
- P= и S= — запиши в p_value/s_value, НЕ клади в walls_cm
- walls_cm содержит ТОЛЬКО длины стен, НЕ периметры и площади
- Количество элементов в walls_cm ДОЛЖНО совпадать с corners`;

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
