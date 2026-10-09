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

/** Цвет свечения по цветовой температуре (Кельвины), приближение Таннера Хелланда
 * (чёрнотельный цвет). 2700K → янтарный, 4000K → тёплый белый, 6500K → почти белый. */
export function kelvinToGlowRGB(kelvin?: number): { r: number; g: number; b: number } {
  const t = Math.max(1000, Math.min(12000, typeof kelvin === "number" ? kelvin : 3000)) / 100;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g = t <= 66 ? clamp(99.4708025861 * Math.log(t) - 161.1195681661) : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  return { r, g, b };
}

/** Параметры детерминированного свечения парящего. Подобраны 09.10 по реальным фото
 * парящих потолков (яркая щель + мягкий wash по стене) на кадрах «Фото клиенту». */
export const PERIMETER_GLOW = {
  /** Видимая высота полосы маски в см (WallElement3D: помощник ceiling-4…-20 см). */
  maskBandCm: 16,
  /** На сколько см верх маски ниже линии потолка. */
  maskTopBelowCeilingCm: 1,
  /** Светящаяся щель (ядро): ширина в см и мягкий край. */
  coreCm: 3,
  coreFeatherCm: 0.8,
  /** Ядро: насколько подтягиваем пиксель к цвету ядра (0..1). */
  coreStrength: 1,
  /** Ореол вокруг ядра (узкий, яркий) — см и сила. */
  haloCm: 7,
  haloStrength: 0.55,
  /** Wash вниз по стене: длина в см и сила (screen) у верха. */
  washCm: 45,
  washStrength: 0.85,
  /** Показатель затухания wash: (1 - t)^falloff, t = 0 у щели → 1 через washCm. */
  washFalloff: 1.3,
  /** Тёплый «окрас» стены в зоне wash (умножение к тону Кельвина). */
  washTint: 0.6,
  /** Тонкая тень кромки полотна прямо над щелью (см, доля затемнения) — даёт щели
   * чёткий верхний край, как на фото (полотно «отрывается» от стены). */
  edgeShadeCm: 1.2,
  edgeShadeStrength: 0.14,
  /** Насыщенность тона Кельвина (0 — белый, 1 — чёрнотельный цвет): камера с балансом белого
   * видит 4000K почти белым, 2700K — янтарным, поэтому тон смягчаем. */
  tintAmount: 0.5,
};

/** Детерминированное свечение парящего по маске периметра из 3D.
 *
 * Маска — полоса верха стены под парящим профилем (WallElement3D, слой FLOATING_MASK_LAYER).
 * Раньше маску просто размывали и клали через screen — на светлой стене это давало бледную
 * симметричную дымку, «периметр не понятно какой» (фидбек 09.10). Теперь по каждой колонке
 * находим верх полосы (≈ линия потолка) и строим ФИЗИЧНЫЙ профиль, масштабируя см по высоте
 * полосы (перспектива учитывается сама): яркая щель 2–3 см у потолка, узкий ореол, длинный
 * мягкий wash вниз по стене (~45 см, квадратичное затухание) с тёплым тоном по Кельвину и
 * тонкую тень кромки полотна над щелью. Стены без парящего не трогаем (маска там чёрная).
 * Пустая маска → исходник без изменений. */
export async function addPerimeterGlow(
  baseBuffer: Buffer,
  floatingMaskBuffer: Buffer,
  kelvin?: number,
  params: Partial<typeof PERIMETER_GLOW> = {},
): Promise<Buffer> {
  const P = { ...PERIMETER_GLOW, ...params };
  const meta = await sharp(baseBuffer).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const stats = await sharp(floatingMaskBuffer).greyscale().stats();
  if ((stats.channels[0]?.max ?? 0) < 20) return baseBuffer;

  const mask = await sharp(floatingMaskBuffer)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  // Карты интенсивности 0..255: core (щель+ореол → цвет ядра), wash (свет по стене),
  // shade (тень кромки полотна над щелью).
  const coreMap = new Uint8Array(width * height);
  const washMap = new Uint8Array(width * height);
  const shadeMap = new Uint8Array(width * height);
  const put = (map: Uint8Array, x: number, y: number, v: number) => {
    if (y < 0 || y >= height || v <= 0) return;
    const i = y * width + x;
    const b = Math.min(255, Math.round(v * 255));
    if (b > map[i]) map[i] = b;
  };

  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (mask[y * width + x] < 100) {
        y++;
        continue;
      }
      const y0 = y;
      while (y < height && mask[y * width + x] >= 100) y++;
      const bandPx = y - y0;
      if (bandPx < 2) continue;
      const pxPerCm = bandPx / P.maskBandCm;
      const yc = y0 - P.maskTopBelowCeilingCm * pxPerCm; // линия потолка
      const coreHalf = Math.max(0.8, (P.coreCm * pxPerCm) / 2);
      const coreCenter = yc + coreHalf;
      const feather = Math.max(1, P.coreFeatherCm * pxPerCm);
      const halo = Math.max(2, P.haloCm * pxPerCm);
      const wash = Math.max(4, P.washCm * pxPerCm);
      const shade = Math.max(1, P.edgeShadeCm * pxPerCm);
      const yTop = Math.floor(yc - shade - feather);
      const yBot = Math.ceil(coreCenter + wash);
      for (let yy = Math.max(0, yTop); yy <= Math.min(height - 1, yBot); yy++) {
        const d = Math.abs(yy - coreCenter);
        // Ядро: плато + мягкий край.
        const core = d <= coreHalf ? 1 : Math.max(0, 1 - (d - coreHalf) / feather);
        // Узкий ореол (экспонента от края ядра).
        const haloV = d <= coreHalf ? 1 : Math.exp(-(d - coreHalf) / (halo / 2.5));
        put(coreMap, x, yy, Math.max(core * P.coreStrength, haloV * P.haloStrength * 0.6));
        if (yy >= coreCenter) {
          const t = (yy - coreCenter) / wash;
          put(washMap, x, yy, t < 1 ? Math.pow(1 - t, P.washFalloff) : 0);
        }
        if (yy < yc - feather * 0.5 && yy >= yc - feather * 0.5 - shade) put(shadeMap, x, yy, 1);
      }
    }
  }

  // Сглаживаем ступеньки на концах полос и по колонкам.
  const blurMap = (m: Uint8Array, sigma: number) =>
    // extractChannel(0): sharp на выходе raw-blur отдаёт 3 канала даже для 1-канального входа.
    sharp(Buffer.from(m.buffer), { raw: { width, height, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
  const minDim = Math.min(width, height);
  const [coreB, washB, shadeB] = await Promise.all([
    blurMap(coreMap, Math.max(0.6, minDim * 0.0008)),
    blurMap(washMap, Math.max(1.5, minDim * 0.004)),
    blurMap(shadeMap, Math.max(0.5, minDim * 0.0006)),
  ]);

  const base = await sharp(baseBuffer).removeAlpha().raw().toBuffer();
  const tint = kelvinToGlowRGB(kelvin);
  const tn = [tint.r / 255, tint.g / 255, tint.b / 255].map((c) => 1 - P.tintAmount * (1 - c));
  // Цвет ядра: почти белый с лёгким оттенком температуры (ядро LED на фото пересвечено).
  const coreC = tn.map((c) => 1 - 0.1 * (1 - c));
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, p = 0; i < width * height; i++, p += 3) {
    const w = (washB[i] / 255) * P.washStrength;
    const c = coreB[i] / 255;
    const sh = (shadeB[i] / 255) * P.edgeShadeStrength * (1 - c);
    for (let ch = 0; ch < 3; ch++) {
      let v = base[p + ch] / 255;
      if (sh > 0) v *= 1 - sh;
      if (w > 0) {
        v = 1 - (1 - v) * (1 - w * tn[ch]); // screen светом нужного тона
        v *= 1 - w * P.washTint * (1 - tn[ch]); // тёплый окрас стены
      }
      if (c > 0 && coreC[ch] > v) v = v + (coreC[ch] - v) * c; // ядро только осветляет
      out[p + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  }

  return await sharp(out, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
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

  // removeAlpha() ЗДЕСЬ, отдельным вызовом (не в одном пайплайне с joinChannel ниже) —
  // ровно 3 канала (RGB). Если removeAlpha и joinChannel в одном пайплайне sharp,
  // добавленный маской канал теряется (на выходе снова 3 канала, без альфы).
  const renderedResized = await sharp(renderedBuffer)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
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

  // Шаг 1: делаем маску АЛЬФА-каналом rendered (где mask бело → непрозрачно → rendered,
  // где чёрно → прозрачно → проступает original). renderedResized уже RGB (3 канала,
  // см. выше), поэтому joinChannel(mask) даёт ровно 4 канала = RGBA с маской в альфе.
  const renderedWithAlpha = await sharp(renderedResized)
    .joinChannel(maskResized)
    .png()
    .toBuffer();

  // Шаг 2: накладываем renderedWithAlpha поверх original
  return await sharp(originalBuffer)
    .composite([{ input: renderedWithAlpha, blend: "over" }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
