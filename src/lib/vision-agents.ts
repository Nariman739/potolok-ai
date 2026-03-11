// Vision system for reading handwritten ceiling measurement sketches
// Architecture:
//   1. ONE AI agent reads the photo → extracts rooms, wall lengths, rectangle decomposition
//   2. TypeScript code calculates area (sum of rectangles) & perimeter (sum of walls)
//   AI does NOT do math — only reads numbers and identifies which walls belong to which room

import { getOpenRouter, VISION_MODEL } from "@/lib/openrouter";

// ─────────────────────────────────────────────────────
// Single agent prompt — reads data + decomposes into rectangles
// ─────────────────────────────────────────────────────

const MEASUREMENT_READER_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

## ТВОЯ ЗАДАЧА
Прочитай с фото ВСЕ комнаты, ВСЕ размеры стен, и РАЗБЕЙ каждую комнату на прямоугольники.
НЕ считай площадь и периметр — только читай числа и разбивай на прямоугольники.

## АЛГОРИТМ

1. Найди ВСЕ замкнутые фигуры на чертеже. Каждая = одна комната.
   НЕ пропускай маленькие (кладовки, санузлы, коридоры, балконы).

2. Для каждой комнаты:
   a) Прочитай ВСЕ числа у стен — КАЖДАЯ сторона имеет размер.
      Маленькие числа (9, 22, 45, 66, 93) тоже стены — не пропускай!

   b) Запиши ВСЕ стены в массив walls_cm (в сантиметрах, по порядку обхода).

   c) РАЗБЕЙ комнату на прямоугольники:
      - Прямоугольная комната = 1 прямоугольник (длина × ширина)
      - Г-образная = 2 прямоугольника
      - П-образная = 3 прямоугольника (или большой минус вырез)
      - Т-образная = 2 прямоугольника
      - Любая сложная = разбей на минимум прямоугольников

      Каждый прямоугольник: {"w_cm": ширина, "h_cm": высота}
      Размеры бери СТРОГО с чертежа — это реальные стены или их части.

3. ЕДИНИЦЫ: числа на чертеже — САНТИМЕТРЫ.
   139 = 139 см, 464 = 464 см, 45 = 45 см, 9 = 9 см.
   Верни всё в САНТИМЕТРАХ (целые числа).

4. P= и S= на чертеже — ИГНОРИРУЙ полностью.

## КАК РАЗБИВАТЬ НА ПРЯМОУГОЛЬНИКИ

### Прямоугольник (4 стены):
Просто 1 прямоугольник: длина × ширина
\`"rectangles_cm": [{"w_cm": 464, "h_cm": 246}]\`

### Г-образная (6 стен):
Раздели на 2 прямоугольника. Пример:
Стены: верх=500, правая=200, ступенька_влево=200, внутренняя_вниз=150, низ=300, левая=350
Прямоугольник 1: 500 × 200 (верхняя часть)
Прямоугольник 2: 300 × 150 (нижняя часть)
\`"rectangles_cm": [{"w_cm": 500, "h_cm": 200}, {"w_cm": 300, "h_cm": 150}]\`

### П-образная (8 стен):
Раздели на 2-3 прямоугольника, ИЛИ используй формулу "большой минус вырез":
\`"rectangles_cm": [{"w_cm": 500, "h_cm": 400}, {"w_cm": -200, "h_cm": -150}]\`
(Минус = вычесть вырез)

## ФОРМАТ ОТВЕТА (только JSON, ничего больше):
\`\`\`json
{
  "rooms": [
    {
      "id": 1,
      "name": "Помещение 1",
      "walls_cm": [464, 246, 464, 246],
      "corners": 4,
      "rectangles_cm": [{"w_cm": 464, "h_cm": 246}]
    },
    {
      "id": 2,
      "name": "Помещение 2",
      "walls_cm": [340, 105, 139, 134, 201, 239],
      "corners": 6,
      "rectangles_cm": [{"w_cm": 340, "h_cm": 105}, {"w_cm": 201, "h_cm": 134}]
    }
  ],
  "total_rooms": 2
}
\`\`\`

## ВАЖНО
- walls_cm — ВСЕ стены по контуру в сантиметрах
- corners — количество углов (вершин) фигуры
- rectangles_cm — разбивка на прямоугольники (программа сама посчитает площадь)
- Отрицательные значения в rectangles_cm = вычесть (вырез)
- НЕ считай итоговую площадь — это сделает программа
- НЕ считай периметр — программа сложит walls_cm
- Если на чертеже есть названия комнат — используй их`;

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface RectangleCm {
  w_cm: number;
  h_cm: number;
}

interface AIRoomReading {
  id: number;
  name: string;
  walls_cm: number[];
  corners: number;
  rectangles_cm: RectangleCm[];
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
  rectangles_cm: RectangleCm[];
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
// Calculate area from rectangle decomposition (pure math)
// ─────────────────────────────────────────────────────
function calculateArea(rectangles_cm: RectangleCm[]): number {
  let area_cm2 = 0;
  for (const rect of rectangles_cm) {
    area_cm2 += rect.w_cm * rect.h_cm; // negative values = subtract (cutouts)
  }
  // Convert cm² to m² and round to 2 decimal places
  return Math.round(Math.abs(area_cm2) / 100) / 100;
}

function calculatePerimeter(walls_cm: number[]): number {
  const total_cm = walls_cm.reduce((sum, w) => sum + Math.abs(w), 0);
  return Math.round(total_cm) / 100;
}

// ─────────────────────────────────────────────────────
// Main: run vision agent + calculate with code
// ─────────────────────────────────────────────────────
export async function runVisionAgents(imageBase64Url: string): Promise<MultiAgentResult> {
  const raw = await callVisionAgent(imageBase64Url);
  console.log("[Vision Agent] Reading:", raw.slice(0, 500));

  const data = extractJson(raw) as AIReadingResult;

  const merged: MergedRoom[] = [];

  for (const room of data.rooms) {
    const walls_m = room.walls_cm.map(cm => Math.round(Math.abs(cm)) / 100);
    const perimeter = calculatePerimeter(room.walls_cm);
    const area = calculateArea(room.rectangles_cm || []);
    const corners = room.corners || room.walls_cm.length;

    merged.push({
      id: room.id,
      name: room.name,
      corners,
      walls: walls_m,
      walls_cm: room.walls_cm,
      perimeter,
      area,
      rectangles_cm: room.rectangles_cm || [],
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
