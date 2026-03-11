// Vision system for reading handwritten ceiling measurement sketches
// Architecture:
//   1. ONE AI agent reads the photo → extracts rooms, shapes, wall lengths
//   2. TypeScript code calculates area & perimeter (no math from AI)

import { getOpenRouter, VISION_MODEL } from "@/lib/openrouter";

// ─────────────────────────────────────────────────────
// Single agent prompt — ONLY reads data, NO calculations
// ─────────────────────────────────────────────────────

const MEASUREMENT_READER_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

## ТВОЯ ЕДИНСТВЕННАЯ ЗАДАЧА
Прочитай с фото ВСЕ комнаты и ВСЕ размеры стен. НЕ считай площадь и периметр — только читай числа.

## АЛГОРИТМ

1. Найди ВСЕ замкнутые фигуры на чертеже. Каждая = одна комната.
   НЕ пропускай маленькие (кладовки, санузлы, коридоры, балконы).

2. Для каждой комнаты:
   a) Определи ФОРМУ:
      - "rectangle" — 4 стены, все углы 90°
      - "l-shape" — Г-образная, 6 стен, все углы 90°
      - "u-shape" — П-образная, 8 стен, все углы 90°
      - "t-shape" — Т-образная, 8 стен, все углы 90°
      - "z-shape" — Z-образная, 8 стен, все углы 90°
      - "pentagon" — 5 стен (например, со срезанным углом)
      - "hexagon" — 6 стен (два срезанных угла или эркер)
      - "trapezoid" — 4 стены, 2 параллельные, 2 под углом
      - "polygon" — любая другая форма (укажи количество стен)

   b) Прочитай ВСЕ числа у стен комнаты — КАЖДАЯ сторона имеет размер.
      Маленькие числа (9, 22, 45, 66, 93) тоже стены — не пропускай!

   c) Запиши стены ПО ПОРЯДКУ обхода по часовой стрелке, начиная с верхней.

   d) Для каждой стены укажи направление поворота на следующую стену:
      - "R" = поворот направо (внутренний угол 90°, стандартный)
      - "L" = поворот налево (внешний угол 270°, выступ)
      Для прямоугольника все повороты = "R".
      Для Г-образной: будет один "L" поворот на выступе.

3. ЕДИНИЦЫ: числа на чертеже — САНТИМЕТРЫ.
   139 = 139 см, 464 = 464 см, 45 = 45 см, 9 = 9 см.
   Верни в САНТИМЕТРАХ (целые числа). НЕ переводи в метры.

4. P= и S= на чертеже — ИГНОРИРУЙ полностью.

5. Если есть ДИАГОНАЛИ (линии между углами с числами) — запиши их тоже.
   Диагонали помогут проверить точность.

## ФОРМАТ ОТВЕТА (только JSON, ничего больше):
\`\`\`json
{
  "rooms": [
    {
      "id": 1,
      "name": "Помещение 1",
      "shape": "rectangle",
      "walls_cm": [464, 246, 464, 246],
      "turns": ["R", "R", "R", "R"],
      "diagonals_cm": []
    },
    {
      "id": 2,
      "name": "Помещение 2",
      "shape": "l-shape",
      "walls_cm": [340, 105, 139, 134, 201, 239],
      "turns": ["R", "R", "L", "R", "R", "R"],
      "diagonals_cm": [{"from": 1, "to": 4, "length_cm": 380}]
    },
    {
      "id": 3,
      "name": "Кладовка",
      "shape": "pentagon",
      "walls_cm": [200, 150, 100, 120, 180],
      "turns": ["R", "R", "R", "R", "R"],
      "diagonals_cm": []
    }
  ],
  "total_rooms": 3
}
\`\`\`

## ВАЖНО
- walls_cm — ВСЕ стены в сантиметрах, в порядке обхода по часовой стрелке
- turns — направление поворота ПОСЛЕ каждой стены ("R" или "L")
- Количество walls_cm ДОЛЖНО совпадать с количеством turns
- Для прямоугольника: ровно 4 стены, все turns = "R"
- Если на чертеже есть названия комнат — используй их
- НЕ считай площадь и периметр — это сделает программа`;

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface Diagonal {
  from: number; // corner index (1-based)
  to: number;   // corner index (1-based)
  length_cm: number;
}

interface AIRoomReading {
  id: number;
  name: string;
  shape: string;
  walls_cm: number[];
  turns: ("R" | "L")[];
  diagonals_cm: Diagonal[];
}

interface AIReadingResult {
  rooms: AIRoomReading[];
  total_rooms: number;
}

export interface MergedRoom {
  id: number;
  name: string;
  shape: string;
  corners: number;
  walls: number[];       // meters
  walls_cm: number[];    // original cm
  turns: ("R" | "L")[];
  perimeter: number;     // meters, calculated by code
  area: number;          // m², calculated by code
  diagonals_cm: Diagonal[];
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
    max_tokens: 1500,
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
// Geometry: calculate area from walls + turns
// ─────────────────────────────────────────────────────

/** Direction vectors: 0=right(+x), 1=down(+y), 2=left(-x), 3=up(-y) */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/** Build polygon vertices from walls + turns, then Shoelace for area */
function calculateFromWalls(
  walls_cm: number[],
  turns: ("R" | "L")[]
): { perimeter_m: number; area_m2: number; vertices: { x: number; y: number }[] } {
  const walls_m = walls_cm.map(cm => cm / 100);
  const perimeter_m = walls_m.reduce((sum, w) => sum + w, 0);

  // Build vertices by walking the polygon
  const vertices: { x: number; y: number }[] = [];
  let x = 0, y = 0, dir = 0; // start at origin, heading right

  for (let i = 0; i < walls_m.length; i++) {
    vertices.push({ x, y });
    x += DX[dir] * walls_m[i];
    y += DY[dir] * walls_m[i];
    // Turn for next wall
    const turn = turns[i];
    if (turn === "R") {
      dir = (dir + 1) % 4; // right turn = clockwise
    } else {
      dir = (dir + 3) % 4; // left turn = counter-clockwise
    }
  }

  // Shoelace formula for area
  const n = vertices.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  const area_m2 = Math.abs(sum) / 2;

  return {
    perimeter_m: Math.round(perimeter_m * 100) / 100,
    area_m2: Math.round(area_m2 * 100) / 100,
    vertices,
  };
}

/** Simple fallback for rectangles: just length × width */
function calculateRectangle(walls_cm: number[]): { perimeter_m: number; area_m2: number } {
  if (walls_cm.length < 2) return { perimeter_m: 0, area_m2: 0 };

  // Take first two unique walls as length and width
  const a = walls_cm[0] / 100;
  const b = walls_cm[1] / 100;

  return {
    perimeter_m: Math.round((2 * (a + b)) * 100) / 100,
    area_m2: Math.round((a * b) * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────
// Main: run vision agent + calculate with code
// ─────────────────────────────────────────────────────
export async function runVisionAgents(imageBase64Url: string): Promise<MultiAgentResult> {
  // ONE agent reads all data
  const raw = await callVisionAgent(imageBase64Url);
  console.log("[Vision Agent] Reading:", raw.slice(0, 300));

  const data = extractJson(raw) as AIReadingResult;

  const merged: MergedRoom[] = [];

  for (const room of data.rooms) {
    const walls_m = room.walls_cm.map(cm => Math.round(cm) / 100);

    let perimeter: number;
    let area: number;

    // Calculate using code, not AI
    if (room.shape === "rectangle" && room.walls_cm.length === 4) {
      // Simple rectangle — most reliable
      const calc = calculateRectangle(room.walls_cm);
      perimeter = calc.perimeter_m;
      area = calc.area_m2;
    } else if (room.walls_cm.length >= 3 && room.turns.length === room.walls_cm.length) {
      // Complex shape — walk the polygon with turns
      const calc = calculateFromWalls(room.walls_cm, room.turns);
      perimeter = calc.perimeter_m;
      area = calc.area_m2;

      // If area is 0 (polygon didn't close), try triangulation fallback
      if (area === 0 && room.shape === "l-shape" && room.walls_cm.length === 6) {
        // L-shape fallback: big rect minus cutout
        // L-shape: walls are [top, right_down, step_left, inner_down, bottom_left, full_left_up]
        const top = room.walls_cm[0] / 100;
        const stepLeft = room.walls_cm[2] / 100;
        const innerDown = room.walls_cm[3] / 100;
        const fullLeft = room.walls_cm[5] / 100;
        area = Math.round((top * fullLeft - stepLeft * innerDown) * 100) / 100;
        if (area < 0) area = Math.round((top * fullLeft + stepLeft * innerDown) * 100) / 100;
      }
    } else {
      // Fallback — just perimeter from walls, area needs manual input
      perimeter = Math.round(walls_m.reduce((s, w) => s + w, 0) * 100) / 100;
      area = 0;
    }

    merged.push({
      id: room.id,
      name: room.name,
      shape: room.shape,
      corners: room.walls_cm.length,
      walls: walls_m,
      walls_cm: room.walls_cm,
      turns: room.turns,
      perimeter,
      area,
      diagonals_cm: room.diagonals_cm || [],
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
  const lines = [`Данные с фото замеров (${result.totalRooms} комнат):\n`];

  for (const room of result.rooms) {
    const extra = room.corners > 4 ? ` (${room.corners - 4} доп.)` : "";
    lines.push(
      `• ${room.name}: ${room.area} м², периметр ${room.perimeter} м, ` +
      `${room.corners} углов${extra}, форма: ${room.shape}`
    );
    if (room.walls.length > 0) {
      lines.push(`  стены: ${room.walls.map(w => w + "м").join(" + ")} = ${room.perimeter} м`);
    }
    if (room.area === 0) {
      lines.push(`  ⚠️ Площадь не удалось рассчитать — проверьте данные`);
    }
  }

  lines.push(`\nИтого: ${result.totalArea} м², периметр ${result.totalPerimeter} м, ${result.totalCorners} углов`);
  lines.push(`\n✅ Периметр и площадь рассчитаны программой (не AI)`);

  return lines.join("\n");
}
