// Распознавание тех.паспортов квартир (печатных планировок).
//
// Отличия от vision-agents.ts (который читает рукописные чертежи мастера):
//  - Печатные планы из БТИ/застройщика, подписи комнат текстом
//    («Кухня 12.5», «Жилая 17.8», «С/У», «Прихожая»)
//  - Размеры часто в метрах с точкой («5.45»), а не в см
//  - Часто только площади внутри комнаты, без размеров на сторонах
//  - Балконы/лоджии обычно ИСКЛЮЧАЕМ (мастер не делает там потолок)
//  - Почти все комнаты прямоугольные → не пытаемся в сложные многоугольники
//
// Если AI распознал только площадь без размеров — оцениваем стены как
// прямоугольник с пропорцией близкой к 1:1.2 (типовая комната).

import { getOpenRouter, VISION_MODEL } from "@/lib/openrouter";
import type { MultiAgentResult, MergedRoom } from "@/lib/vision-agents";
import { computeCostFromUsage } from "@/lib/ai-cost-cap";

const TECHPASSPORT_READER_PROMPT = `Ты — анализатор планов квартир (тех.паспортов БТИ или планов от застройщика).

## ЗАДАЧА
Найди все ЖИЛЫЕ комнаты на плане квартиры и для каждой определи:
1. Название (берёшь с подписи на плане)
2. Площадь в м² (если подписана)
3. Размеры сторон в см (если подписаны вдоль стен)

## ЧТО ВКЛЮЧАТЬ
✅ Жилые комнаты (Жилая, Гостиная, Спальня)
✅ Кухня, Кухня-гостиная
✅ Прихожая, Коридор, Холл
✅ Санузел, Ванная, Туалет, С/У
✅ Гардеробная, Кладовая (если внутри квартиры)

## ЧТО ИСКЛЮЧАТЬ
❌ Балкон, Лоджия, Терраса (там потолок не натяжной)
❌ Технические помещения (шахта, вентканал)
❌ Соседние квартиры, лестничная клетка

## ФОРМАТ РАЗМЕРОВ
- Если размеры на плане в МЕТРАХ ("5.45", "3.20") — конвертируй в см (×100)
- Если в МИЛЛИМЕТРАХ ("5450", "3200") — конвертируй в см (÷10)
- Если в САНТИМЕТРАХ ("545", "320") — оставляй как есть
- Площадь оставляй в м² с одним знаком после запятой

## ЕСЛИ РАЗМЕРЫ НЕ ВИДНЫ
Если на плане видна только площадь, но не видны размеры сторон —
оцени стены как прямоугольник:
- short = sqrt(area / 1.3)
- long = area / short
Округли до 10 см (например 3.2 м → 320 см).

## ПРИМЕРЫ ИМЁН (приведи к этим)
- "Жилая 17.8" → "Жилая"
- "К-1", "Комната-1" → "Жилая"
- "Кух." → "Кухня"
- "С/У", "Совм.с/у" → "Санузел"
- "Пр.", "Прих." → "Прихожая"
- "Кор." → "Коридор"
- "Г-щная", "ГК" → "Гостиная"

## ФОРМАТ ОТВЕТА
Сначала кратко опиши что видишь на плане (одно предложение),
потом JSON в блоке \`\`\`json.

\`\`\`json
{
  "rooms": [
    {
      "name": "Кухня",
      "area_m2": 12.5,
      "walls_cm": [450, 280, 450, 280],
      "source": "measured"
    },
    {
      "name": "Жилая",
      "area_m2": 17.8,
      "walls_cm": [380, 470, 380, 470],
      "source": "estimated"
    }
  ]
}
\`\`\`

## ПОЛЯ
- name — короткое имя комнаты (см. примеры выше)
- area_m2 — площадь с одним знаком, обязательно число
- walls_cm — массив длин стен в СМ, всегда 4 значения (прямоугольник),
  по часовой стрелке от верхней стены. Если непрямоугольная — всё равно
  приближай к прямоугольнику с такой же площадью.
- source — "measured" если размеры были на плане, "estimated" если оценил
  по площади

## ВАЖНО
- Точность по площади важнее точности по стенам. Если сомневаешься в
  размерах — лучше выставь estimated по площади.
- НЕ выдумывай комнаты. Если на плане не видно — лучше пропусти, чем
  угадать.
- Если на фото вообще не план квартиры (например, рукописный чертёж
  одной комнаты), верни пустой массив rooms.`;

interface ParsedRoom {
  name: string;
  area_m2: number;
  walls_cm: number[];
  source?: "measured" | "estimated";
}

interface ParsedResult {
  rooms: ParsedRoom[];
}

function extractJson(text: string): unknown {
  const jsonBlock = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlock) return JSON.parse(jsonBlock[1]);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  throw new Error("No JSON found in agent response");
}

async function callVisionAgent(
  imageBase64Url: string,
): Promise<{ text: string; costUsd: number }> {
  const result = await getOpenRouter().chat.completions.create({
    model: VISION_MODEL,
    messages: [
      { role: "system", content: TECHPASSPORT_READER_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Это тех.паспорт квартиры или план от застройщика. Найди все ЖИЛЫЕ комнаты + кухню/санузел/прихожую. Балконы и лоджии исключай.",
          },
          { type: "image_url", image_url: { url: imageBase64Url } },
        ],
      },
    ],
    stream: false,
    max_tokens: 3000,
    temperature: 0.1,
  });

  return {
    text: result.choices[0]?.message?.content?.trim() || "",
    costUsd: computeCostFromUsage(result.usage, VISION_MODEL),
  };
}

function roundTo10cm(cm: number): number {
  return Math.round(cm / 10) * 10;
}

function normalizeRoom(r: ParsedRoom): MergedRoom | null {
  if (!r.name || typeof r.area_m2 !== "number" || r.area_m2 <= 0) {
    return null;
  }

  let walls = Array.isArray(r.walls_cm) ? r.walls_cm.map(Number).filter((w) => w > 0) : [];

  // Если стен нет или их не 4 — оцениваем по площади как прямоугольник 1:1.3.
  if (walls.length !== 4) {
    const areaCm2 = r.area_m2 * 10000;
    const shortSide = Math.sqrt(areaCm2 / 1.3);
    const longSide = areaCm2 / shortSide;
    const s = roundTo10cm(shortSide);
    const l = roundTo10cm(longSide);
    walls = [l, s, l, s];
  } else {
    walls = walls.map(roundTo10cm);
  }

  const perimeter = walls.reduce((s, w) => s + w, 0) / 100;
  const area = r.area_m2;

  return {
    id: 0,
    name: r.name,
    corners: walls.length,
    walls,
    walls_cm: walls,
    perimeter: Math.round(perimeter * 100) / 100,
    area: Math.round(area * 100) / 100,
    areaMethod: r.source === "measured" ? "techpassport-measured" : "techpassport-estimated",
    p_value: null,
    s_value: r.area_m2,
  };
}

export async function runTechpassportVision(imageBase64Url: string): Promise<MultiAgentResult> {
  const { text: raw, costUsd } = await callVisionAgent(imageBase64Url);
  console.log("[Techpassport Vision] Response length:", raw.length);

  const data = extractJson(raw) as ParsedResult;
  const rooms: MergedRoom[] = [];

  if (Array.isArray(data.rooms)) {
    let id = 1;
    for (const r of data.rooms) {
      const normalized = normalizeRoom(r);
      if (normalized) {
        normalized.id = id++;
        rooms.push(normalized);
      }
    }
  }

  const totalArea = Math.round(rooms.reduce((s, r) => s + r.area, 0) * 100) / 100;
  const totalPerimeter = Math.round(rooms.reduce((s, r) => s + r.perimeter, 0) * 100) / 100;
  const totalCorners = rooms.reduce((s, r) => s + r.corners, 0);

  return {
    rooms,
    totalRooms: rooms.length,
    totalCorners,
    totalPerimeter,
    totalArea,
    __costUsd: costUsd,
  };
}
