// Генератор PNG-маски из polygon координат для FLUX Fill (inpaint).
// Белая зона внутри polygon = "только здесь модель может рисовать"
// Чёрная зона снаружи = "не трогай, заморозить пиксели исходного фото"

import sharp from "sharp";

export interface PolygonPoint {
  x: number; // 0..100 (% от ширины изображения)
  y: number; // 0..100 (% от высоты)
}

/** Сжимает polygon на `inset` процентов к центроиду — гарантирует что маска
 * не залезает на стены даже при неточной разметке. */
function shrinkPolygon(points: PolygonPoint[], insetPercent: number): PolygonPoint[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => ({
    x: p.x + (cx - p.x) * (insetPercent / 100),
    y: p.y + (cy - p.y) * (insetPercent / 100),
  }));
}

/** Генерит PNG-маску того же размера что исходное фото.
 * polygonPercents — массив точек polygon в процентах (как сохранено в MarkupData.ceilingPolygon).
 * shrinkInset — на сколько % сжать polygon внутрь (защита от попадания на стены, default 0).
 */
export async function generatePolygonMask(
  polygonPercents: PolygonPoint[],
  imageWidth: number,
  imageHeight: number,
  shrinkInset = 0,
): Promise<Buffer> {
  if (polygonPercents.length < 3) {
    throw new Error("Polygon должен иметь минимум 3 точки");
  }

  const points = shrinkInset > 0 ? shrinkPolygon(polygonPercents, shrinkInset) : polygonPercents;
  const pointsAttr = points
    .map((p) => {
      const px = Math.max(0, Math.min(imageWidth, (p.x / 100) * imageWidth));
      const py = Math.max(0, Math.min(imageHeight, (p.y / 100) * imageHeight));
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");

  // SVG: чёрный фон + белый polygon. Sharp конвертит в PNG.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}"><rect width="${imageWidth}" height="${imageHeight}" fill="black"/><polygon points="${pointsAttr}" fill="white"/></svg>`;

  return await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

/** Получить размеры изображения из его base64/buffer. */
export async function getImageDimensions(
  imageBuffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(imageBuffer).metadata();
  return {
    width: meta.width ?? 1024,
    height: meta.height ?? 1024,
  };
}

/** Генерит "annotated photo" — то же фото с цветной разметкой потолка поверх.
 * AI получает этот overlay как ВТОРОЕ изображение и видит ГЛАЗАМИ где должны
 * стоять фикстуры — это работает в разы лучше чем текстовые координаты в промпте.
 *
 * Цвета overlay:
 *   - Жёлтая толстая рамка по ceilingPolygon = LED-зазор парящего потолка / теневой шов
 *   - Красные линии = магнитные треки
 *   - Оранжевые линии = светящиеся LED-линии (lightline)
 *   - Зелёные кружки = встроенные споты
 *   - Фиолетовые звёзды = люстры
 */
export interface MarkupForOverlay {
  points: Array<{ id: string; type: "spot" | "chandelier"; x: number; y: number }>;
  lines: Array<{ id: string; type: "track" | "lightline"; x1: number; y1: number; x2: number; y2: number }>;
  ceilingPolygon?: Array<{ x: number; y: number }>;
}

export async function generateMarkupOverlay(
  originalBuffer: Buffer,
  markup: MarkupForOverlay,
  attachmentType: "regular" | "shadow" | "floating",
): Promise<Buffer> {
  const meta = await sharp(originalBuffer).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // Толщины и размеры в пикселях относительно размера фото — чтобы было видно на любом разрешении.
  // LED-рамку делаем особенно жирной чтобы AI не пропускал длинные стороны.
  const ledFrameStroke = Math.max(14, Math.round(Math.min(width, height) * 0.035));
  const lineStroke = Math.max(8, Math.round(Math.min(width, height) * 0.016));
  const spotR = Math.max(12, Math.round(Math.min(width, height) * 0.022));
  const chandelierR = Math.max(18, Math.round(Math.min(width, height) * 0.032));

  const toPx = (p: { x: number; y: number }) => ({
    x: (p.x / 100) * width,
    y: (p.y / 100) * height,
  });

  const svgParts: string[] = [];

  // LED-рамка по полигону потолка (только если floating или shadow и polygon задан)
  if (
    markup.ceilingPolygon &&
    markup.ceilingPolygon.length >= 3 &&
    (attachmentType === "floating" || attachmentType === "shadow")
  ) {
    const points = markup.ceilingPolygon
      .map(toPx)
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const color = attachmentType === "floating" ? "#facc15" : "#1e293b"; // жёлтый LED / тёмная shadow gap
    // Двойная обводка: внешняя тонкая яркая (граница) + внутренняя толстая полупрозрачная (заливка-glow).
    // Так AI чётко видит ВСЕ стороны полигона на длинных стенах — не теряет ребро.
    svgParts.push(
      `<polygon points="${points}" fill="none" stroke="${color}" stroke-width="${ledFrameStroke}" stroke-linejoin="round" opacity="0.95" />`,
      `<polygon points="${points}" fill="none" stroke="${color}" stroke-width="${Math.max(2, Math.round(ledFrameStroke * 0.35))}" stroke-linejoin="round" opacity="1.0" />`,
    );
  }

  // Треки и LED-линии
  for (const l of markup.lines) {
    const a = toPx({ x: l.x1, y: l.y1 });
    const b = toPx({ x: l.x2, y: l.y2 });
    const color = l.type === "track" ? "#dc2626" : "#f97316"; // красный трек / оранжевый light line
    svgParts.push(
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${color}" stroke-width="${lineStroke}" stroke-linecap="round" opacity="0.9" />`,
    );
  }

  // Споты — зелёные кружки с белой обводкой
  for (const p of markup.points.filter((x) => x.type === "spot")) {
    const px = toPx(p);
    svgParts.push(
      `<circle cx="${px.x.toFixed(1)}" cy="${px.y.toFixed(1)}" r="${spotR}" fill="#10b981" stroke="white" stroke-width="${Math.max(2, spotR * 0.2)}" opacity="0.95" />`,
    );
  }

  // Люстры — фиолетовый круг побольше
  for (const p of markup.points.filter((x) => x.type === "chandelier")) {
    const px = toPx(p);
    svgParts.push(
      `<circle cx="${px.x.toFixed(1)}" cy="${px.y.toFixed(1)}" r="${chandelierR}" fill="#a855f7" stroke="white" stroke-width="${Math.max(3, chandelierR * 0.18)}" opacity="0.95" />`,
    );
  }

  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svgParts.join("")}</svg>`;

  const overlayPng = await sharp(Buffer.from(overlaySvg)).png().toBuffer();

  // Композитим overlay поверх оригинального фото → annotated photo
  return await sharp(originalBuffer)
    .composite([{ input: overlayPng, blend: "over" }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Composite: где маска БЕЛАЯ → пиксели из rendered, где ЧЁРНАЯ → пиксели из original.
 * Это даёт hard-constraint: AI-результат "вырезается" из rendered ТОЛЬКО внутри polygon,
 * а вся комната (стены/пол/мебель) остаётся пиксель-в-пиксель из original.
 */
export async function compositeWithMask(
  originalBuffer: Buffer,
  renderedBuffer: Buffer,
  maskBuffer: Buffer,
): Promise<Buffer> {
  // Приводим размеры rendered и mask к размеру original (provider мог изменить разрешение)
  const origMeta = await sharp(originalBuffer).metadata();
  const width = origMeta.width ?? 1024;
  const height = origMeta.height ?? 1024;

  const renderedResized = await sharp(renderedBuffer)
    .resize(width, height, { fit: "fill" })
    .toBuffer();

  // Умеренный feather 0.6% — мягкий переход на границе, но не съедает фикстуры
  // которые AI рисует у краёв потолка (споты возле окон / треки у стен).
  // Расширение полигона делается на этапе генерации маски (см. render route, shrinkInset=-2).
  const featherRadius = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  const maskResized = await sharp(maskBuffer)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .blur(featherRadius)
    .toBuffer();

  // Шаг 1: вырезаем из rendered только зону маски (dest-in делает прозрачным где mask чёрная)
  const renderedWithAlpha = await sharp(renderedResized)
    .ensureAlpha()
    .joinChannel(maskResized) // маска становится альфа-каналом
    .png()
    .toBuffer();

  // Шаг 2: накладываем renderedWithAlpha поверх original
  return await sharp(originalBuffer)
    .composite([{ input: renderedWithAlpha, blend: "over" }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
