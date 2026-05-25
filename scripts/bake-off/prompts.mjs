// Единый тестовый промпт для всех провайдеров.
// Цель — стандартный сценарий: парящий потолок с LED + 6 спотов + центральная люстра.
// Намеренно жёсткие констрейнты "Keep ... UNCHANGED" чтобы померить насколько модель их соблюдает.

export const TEST_PROMPT = `Photorealistic interior render of the SAME ROOM in the input image, but with a newly installed white matte stretched ceiling.

Ceiling details:
- "Floating" (paryashchy) profile around the perimeter with a warm white LED light strip glowing softly along the edges
- 6 small recessed cool-white LED spotlights evenly distributed across the ceiling
- One modern minimalist chandelier hanging in the center of the room

CRITICAL CONSTRAINTS:
- Keep walls, floor, furniture, windows, doors, and all room contents COMPLETELY UNCHANGED
- Preserve the exact camera angle, perspective, and natural lighting of the input photo
- The ceiling must look professionally installed, no gaps, no artifacts
- No text, no watermark, no UI elements`;

export const SHORT_PROMPT = `Replace ONLY the ceiling with a glossy white stretched ceiling featuring a floating perimeter with warm LED strip lighting, 6 recessed cool-white spotlights, and a modern central chandelier. Keep walls, furniture, windows, and floor identical to the original photo.`;
