// Multi-agent vision system for reading handwritten ceiling measurement sketches
// 3 specialized agents run IN PARALLEL on the same photo:
//   1. Room Detector + Corner Counter
//   2. Perimeter Calculator
//   3. Area Calculator
// Results are merged into a unified room list

import { getOpenRouter, AI_MODEL } from "@/lib/openrouter";

// ─────────────────────────────────────────────────────
// Agent prompts — each is laser-focused on ONE task
// ─────────────────────────────────────────────────────

const ROOMS_AND_CORNERS_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

ЗАДАЧА: найди ВСЕ комнаты и посчитай углы каждой.

## АЛГОРИТМ

1. Найди ВСЕ замкнутые фигуры на чертеже. Каждая = одна комната.
   НЕ пропускай маленькие (кладовки, санузлы, коридоры, балконы).

2. Для каждой комнаты определи ФОРМУ:
   - Прямоугольник → 4 угла
   - Г-образная (L-shape, один вырез) → 6 углов
   - П-образная (U-shape, два выреза) → 8 углов
   - Т-образная → 8 углов
   - Более сложная → посчитай все вершины

3. Посчитай углы: каждый поворот контура (каждая вершина) = 1 угол.
   Прямоугольник = 4. Г-образная = 6. Считай ВСЕ, включая внутренние повороты.

## ЕДИНИЦЫ
Числа на чертеже — САНТИМЕТРЫ (139 = 1.39м, 464 = 4.64м, 45 = 0.45м).
P= и S= — ИГНОРИРУЙ.

## ФОРМАТ ОТВЕТА (только JSON, ничего больше):
\`\`\`json
{
  "rooms": [
    {"id": 1, "name": "Помещение 1", "shape": "rectangle", "corners": 4, "walls_count": 4},
    {"id": 2, "name": "Помещение 2", "shape": "L-shape", "corners": 6, "walls_count": 6},
    {"id": 3, "name": "Помещение 3", "shape": "rectangle", "corners": 4, "walls_count": 4}
  ],
  "total_rooms": 3,
  "total_corners": 14
}
\`\`\`

Если на чертеже есть названия комнат — используй их. Иначе "Помещение N".
shape: "rectangle", "L-shape", "U-shape", "T-shape", "complex"`;

const PERIMETER_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

ЗАДАЧА: для КАЖДОЙ комнаты на чертеже посчитай ПЕРИМЕТР.

## АЛГОРИТМ

1. Найди ВСЕ замкнутые фигуры (комнаты). Не пропускай маленькие.

2. Для каждой комнаты:
   a) Прочитай ВСЕ числа у её стен — каждая сторона имеет размер
   b) Маленькие числа (9, 22, 45, 66, 93) тоже стены — не пропускай!
   c) Переведи в метры: все целые числа — САНТИМЕТРЫ, дели на 100
      Примеры: 139→1.39м, 464→4.64м, 246→2.46м, 45→0.45м, 9→0.09м
   d) ПЕРИМЕТР = сумма ВСЕХ стен по контуру
   e) Запиши каждую стену отдельно для проверки

3. P= и S= на чертеже — ИГНОРИРУЙ. Считай сам из стен.

## САМОПРОВЕРКА
- У прямоугольника 4 стены, у Г-образной 6 стен
- Типичный периметр одной комнаты: 4-25 метров
- Две противоположные стороны прямоугольника РАВНЫ

## ФОРМАТ ОТВЕТА (только JSON, ничего больше):
\`\`\`json
{
  "rooms": [
    {
      "id": 1,
      "name": "Помещение 1",
      "walls": [4.64, 2.46, 4.64, 2.46],
      "perimeter": 14.2
    },
    {
      "id": 2,
      "name": "Помещение 2",
      "walls": [3.40, 1.05, 1.39, 1.34, 2.01, 2.39],
      "perimeter": 11.58
    }
  ]
}
\`\`\`

walls — длины ВСЕХ стен по контуру в метрах, по порядку обхода.
perimeter — их сумма.`;

const AREA_PROMPT = `Ты — эксперт по чтению рукописных чертежей замеров натяжных потолков.

ЗАДАЧА: для КАЖДОЙ комнаты на чертеже посчитай ПЛОЩАДЬ.

## АЛГОРИТМ

1. Найди ВСЕ замкнутые фигуры (комнаты). Не пропускай маленькие.

2. Для каждой комнаты:
   a) Определи форму: прямоугольник, Г-образная, П-образная, сложная
   b) Прочитай размеры стен. Все целые числа — САНТИМЕТРЫ, дели на 100
      Примеры: 139→1.39м, 464→4.64м, 246→2.46м, 45→0.45м
   c) Считай площадь:
      - Прямоугольник: длина × ширина
      - Г-образная: РАЗДЕЛИ на 2 прямоугольника, посчитай каждый, СЛОЖИ
        НЕЛЬЗЯ считать Г-образную как max_длина × max_ширина!
      - П-образная: раздели на 3 прямоугольника
      - Сложная: раздели на простые фигуры
   d) Запиши разбивку на прямоугольники для проверки

3. P= и S= на чертеже — ИГНОРИРУЙ. Считай сам из стен.

## САМОПРОВЕРКА
- Площадь Г-образной ВСЕГДА меньше max_длина × max_ширина
- Типичная комната: 2-25 м²
- Кладовка/санузел: 1-5 м²

## ФОРМАТ ОТВЕТА (только JSON, ничего больше):
\`\`\`json
{
  "rooms": [
    {
      "id": 1,
      "name": "Помещение 1",
      "shape": "rectangle",
      "length": 4.64,
      "width": 2.46,
      "rectangles": [{"w": 4.64, "h": 2.46, "area": 11.41}],
      "area": 11.41
    },
    {
      "id": 2,
      "name": "Помещение 2",
      "shape": "L-shape",
      "length": 3.40,
      "width": 2.39,
      "rectangles": [
        {"w": 3.40, "h": 1.05, "area": 3.57},
        {"w": 1.39, "h": 1.34, "area": 1.86}
      ],
      "area": 5.43
    }
  ],
  "total_area": 16.84
}
\`\`\`

rectangles — разбивка на прямоугольники (для проверки).
area — сумма площадей прямоугольников.`;

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface RoomCorners {
  id: number;
  name: string;
  shape: string;
  corners: number;
}

interface RoomPerimeter {
  id: number;
  name: string;
  walls: number[];
  perimeter: number;
}

interface RoomArea {
  id: number;
  name: string;
  shape: string;
  length: number;
  width: number;
  rectangles: Array<{ w: number; h: number; area: number }>;
  area: number;
}

export interface MergedRoom {
  id: number;
  name: string;
  shape: string;
  corners: number;
  walls: number[];
  perimeter: number;
  length: number;
  width: number;
  area: number;
  rectangles: Array<{ w: number; h: number; area: number }>;
}

export interface MultiAgentResult {
  rooms: MergedRoom[];
  totalRooms: number;
  totalCorners: number;
  totalPerimeter: number;
  totalArea: number;
}

// ─────────────────────────────────────────────────────
// Call a single vision agent
// ─────────────────────────────────────────────────────
async function callVisionAgent(
  systemPrompt: string,
  imageBase64Url: string
): Promise<string> {
  const result = await getOpenRouter().chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Проанализируй этот чертёж замеров." },
          { type: "image_url", image_url: { url: imageBase64Url } },
        ],
      },
    ],
    stream: false,
    max_tokens: 800,
    temperature: 0.1, // Low temp for precision
  });

  return result.choices[0]?.message?.content?.trim() || "";
}

// ─────────────────────────────────────────────────────
// Parse JSON from agent response
// ─────────────────────────────────────────────────────
function extractJson(text: string): unknown {
  // Try ```json block first
  const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlock) {
    return JSON.parse(jsonBlock[1]);
  }
  // Try raw JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  throw new Error("No JSON found in agent response");
}

// ─────────────────────────────────────────────────────
// Run all 3 agents in parallel, merge results
// ─────────────────────────────────────────────────────
export async function runVisionAgents(imageBase64Url: string): Promise<MultiAgentResult> {
  // Launch all 3 agents simultaneously
  const [cornersRaw, perimeterRaw, areaRaw] = await Promise.all([
    callVisionAgent(ROOMS_AND_CORNERS_PROMPT, imageBase64Url),
    callVisionAgent(PERIMETER_PROMPT, imageBase64Url),
    callVisionAgent(AREA_PROMPT, imageBase64Url),
  ]);

  console.log("[Vision Agent] Corners:", cornersRaw.slice(0, 200));
  console.log("[Vision Agent] Perimeter:", perimeterRaw.slice(0, 200));
  console.log("[Vision Agent] Area:", areaRaw.slice(0, 200));

  // Parse results
  const cornersData = extractJson(cornersRaw) as { rooms: RoomCorners[]; total_rooms: number; total_corners: number };
  const perimeterData = extractJson(perimeterRaw) as { rooms: RoomPerimeter[] };
  const areaData = extractJson(areaRaw) as { rooms: RoomArea[]; total_area: number };

  // Merge by room index (id)
  // Use the room count from the agent that found the most rooms (less likely to miss)
  const maxRooms = Math.max(
    cornersData.rooms.length,
    perimeterData.rooms.length,
    areaData.rooms.length
  );

  const merged: MergedRoom[] = [];

  for (let i = 0; i < maxRooms; i++) {
    const cornerRoom = cornersData.rooms[i];
    const perimRoom = perimeterData.rooms[i];
    const areaRoom = areaData.rooms[i];

    // Pick name from whichever agent has it
    const name = cornerRoom?.name || perimRoom?.name || areaRoom?.name || `Помещение ${i + 1}`;

    merged.push({
      id: i + 1,
      name,
      shape: cornerRoom?.shape || areaRoom?.shape || "rectangle",
      corners: cornerRoom?.corners || 4,
      walls: perimRoom?.walls || [],
      perimeter: perimRoom?.perimeter || 0,
      length: areaRoom?.length || 0,
      width: areaRoom?.width || 0,
      area: areaRoom?.area || 0,
      rectangles: areaRoom?.rectangles || [],
    });
  }

  const totalArea = merged.reduce((s, r) => s + r.area, 0);
  const totalPerimeter = merged.reduce((s, r) => s + r.perimeter, 0);
  const totalCorners = merged.reduce((s, r) => s + r.corners, 0);

  return {
    rooms: merged,
    totalRooms: merged.length,
    totalCorners,
    totalPerimeter: Math.round(totalPerimeter * 100) / 100,
    totalArea: Math.round(totalArea * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────
// Format merged results for conversation agent
// ─────────────────────────────────────────────────────
export function formatVisionResults(result: MultiAgentResult): string {
  const lines = [`Данные с фото замеров (${result.totalRooms} комнат):\n`];

  for (const room of result.rooms) {
    const extra = room.corners > 4 ? ` (${room.corners - 4} доп.)` : "";
    const rectInfo = room.rectangles.length > 1
      ? ` [${room.rectangles.map(r => `${r.w}×${r.h}=${r.area}`).join(" + ")}]`
      : "";
    lines.push(
      `• ${room.name}: ${room.area} м², периметр ${room.perimeter} м, ` +
      `${room.corners} углов${extra}, форма: ${room.shape}${rectInfo}`
    );
    if (room.walls.length > 0) {
      lines.push(`  стены: ${room.walls.join(" + ")} = ${room.perimeter} м`);
    }
  }

  lines.push(`\nИтого: ${result.totalArea} м², периметр ${result.totalPerimeter} м, ${result.totalCorners} углов`);

  return lines.join("\n");
}
