// Альфа-текстуры для «света» светильников (10.10.2026).
//
// Настоящие pointLight на expo-gl дорогие (фриз при ~15 шт., 29.06), а
// pointLight без теней всё равно не даёт «гребешков» на стене. Поэтому свет
// рисуем картинками: белая RGB + альфа-маска, AdditiveBlending поверх
// полотна/стены/пола. Одна выборка из текстуры на пиксель — на Mali-G68 это
// бесплатно. Текстуры генерируются один раз и кэшируются.

import * as THREE from "three";
import { WINDOW_FLOOR_EDGE, WINDOW_FLOOR_FALL } from "./windowLight";

const cache = new Map<string, THREE.DataTexture>();

function makeAlpha(key: string, w: number, h: number, fn: (u: number, v: number) => number): THREE.DataTexture {
  const cached = cache.get(key);
  if (cached) return cached;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = h === 1 ? 0.5 : y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = w === 1 ? 0.5 : x / (w - 1);
      const a = Math.max(0, Math.min(1, fn(u, v)));
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * a);
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/** Круглое пятно: ярко в центре, мягко к краю (ореол на полотне, пятно на полу). */
export function getRadialTexture(): THREE.DataTexture {
  return makeAlpha("radial2", 64, 64, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    if (r >= 1) return 0;
    const t = 1 - r;
    // Ядро ярче и компактнее, хвост короче — на iPhone старая версия
    // читалась как «размазанное» пятно без края (10.10).
    return Math.pow(t, 2.6);
  });
}

/**
 * «Гребешок» на стене от софита у стены: узкий у потолка (v=1), расширяется
 * и гаснет вниз. Форма по фото накладных/встроенных спотов у стен.
 */
export function getScallopTexture(): THREE.DataTexture {
  return makeAlpha("scallop", 64, 96, (u, v) => {
    const down = 1 - v; // 0 у потолка, 1 внизу
    // Парабола, не треугольник (аудит 02.11): край гребешка на фото круглый.
    const halfW = 0.1 + 0.38 * Math.sqrt(down); // вершина у потолка, расширяется вниз
    const d = (u - 0.5) / halfW;
    const across = Math.exp(-d * d * 3.0);
    const fall = Math.pow(v, 1.9); // гаснет вниз быстрее
    return across * fall;
  });
}

/**
 * Утопленная гардина снизу (04.11, фото изделия gardina-alu-1/-2, gardina-plastic):
 * белая полоса профиля в плоскости полотна, вдоль неё 2–3 тёмные дорожки-пазы
 * ~6 мм с лёгкой тенью внутри. u — поперёк полосы, v — вдоль (однородно).
 */
export function getGardinaTexture(rows: 1 | 2 | 3, color: "black" | "white" = "black"): THREE.DataTexture {
  const key = `gardina-rows${rows}-${color}`;
  const cached = cache.get(key);
  if (cached) return cached;
  // Плоскость [длина × ширина]: u — вдоль гардины, v — поперёк. Пазы идут вдоль,
  // значит меняемся по v (строкам текстуры).
  const w = 4;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  // Дно утопленного канала (главный эталон gardina-installed-white.jpg,
  // Нариман 04.11): rows+1 гребней и rows тёмных щелей между ними.
  // Чёрная (по умолчанию, Нариман 04.11 — заметнее) или белая (09.11: цвет из
  // поля элемента color; белая — гребни #E6E6E3, щели #3A3A3A, как у изделия на фото).
  const white = color === "white";
  const base = white ? [0xe6, 0xe6, 0xe3] : [0x3a, 0x3a, 0x3c];  // гребень
  const dark = white ? [0x3a, 0x3a, 0x3a] : [0x0a, 0x0a, 0x0a];  // щель
  const shade = white ? [0xc9, 0xc9, 0xc6] : [0x66, 0x66, 0x68]; // кромка гребня у щели
  const nSlots = rows;
  const slotW = 0.11; // доля ширины канала на щель (≈ 11 мм при 100 мм)
  const ridgeW = (1 - nSlots * slotW) / (nSlots + 1);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    let px = base;
    let t = 0;
    for (let s = 0; s < nSlots; s++) {
      const s0 = ridgeW * (s + 1) + slotW * s;
      const s1 = s0 + slotW;
      if (v >= s0 && v < s1) {
        px = dark;
        t = 1;
      } else if (v >= s0 - 0.02 && v < s0) {
        px = shade; // блик кромки перед щелью
        t = 1;
      }
    }
    const r = Math.round(base[0] + (px[0] - base[0]) * t);
    const g = Math.round(base[1] + (px[1] - base[1]) * t);
    const b = Math.round(base[2] + (px[2] - base[2]) * t);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

/** Свет из окна на полу (этап 2, эталон окно-1): трапеция от проёма в комнату,
 *  ярко у окна, спад за ~2 м; края мягкие. u — поперёк, v — от окна (0) вглубь (1). */
export function getWindowFloorTexture(): THREE.DataTexture {
  // Этап 5, лист 06: край мягче (WINDOW_FLOOR_EDGE 0.45 вместо 0.16) и спад
  // по длине положе — плавный градиент без видимого контура фигуры.
  return makeAlpha("winfloor2", 32, 64, (u, v) => {
    const fall = Math.pow(1 - v, WINDOW_FLOOR_FALL);
    const e = Math.min(1, Math.min(u, 1 - u) / WINDOW_FLOOR_EDGE);
    const across = e * e * (3 - 2 * e);
    return fall * across;
  });
}

/** Полоса: ярко по оси, мягко к краям и к концам (ореол вдоль линии/трека).
 *  Концы раньше обрывались резко — на iPhone ореол читался белым прямоугольником. */
/**
 * Профиль засвета по ширине полосы (u: 0 — у щели, 1 — дальний край), нормирован на пик.
 * Для stripGeometry (level2Geometry3D), где u идёт поперёк полосы. fn(d) — доля на расстоянии
 * d (м) от щели, spanM — ширина полосы.
 */
export function getProfileAlphaTextureU(key: string, spanM: number, fn: (d: number) => number): THREE.DataTexture {
  const n = 128;
  const vals: number[] = [];
  for (let i = 0; i < n; i++) vals.push(fn((i / (n - 1)) * spanM));
  const peak = Math.max(...vals) || 1;
  return makeAlpha(key, n, 1, (u) => vals[Math.round(u * (n - 1))] / peak);
}

export function getStripTexture(): THREE.DataTexture {
  return makeAlpha("strip2", 64, 16, (u, v) => {
    const d = Math.abs(v - 0.5) * 2; // поперёк (v — ширина плоскости)
    const across = (1 - d) * (1 - d);
    const e = Math.min(u, 1 - u) / 0.18; // вдоль: затухание на 18 % с каждого конца
    const ends = Math.min(1, e);
    return across * ends * ends;
  });
}

/**
 * Свечение вокруг лампы (02.11.2026, по фото GX53/люстр): яркое плотное ядро
 * у самого рассеивателя + длинный мягкий хвост — то, что на фото даёт камера
 * (bloom), а в сцене без постобработки приходится рисовать картинкой.
 */
export function getGlowTexture(): THREE.DataTexture {
  return makeAlpha("glow1", 96, 96, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2; // 0 центр … 1 край
    if (r >= 1) return 0;
    const core = Math.exp(-(r * r) / 0.012); // ядро ~Ø10 % плоскости
    const tail = Math.pow(1 - r, 3.2) * 0.55; // мягкий хвост до края
    return Math.min(1, core + tail);
  });
}

/**
 * Контактная тень под мебелью: мягкий скруглённый прямоугольник — плотный под
 * предметом, тает к краю. Без неё мебель «висит» над полом (аудит 02.11.2026).
 */
export function getSoftRectTexture(): THREE.DataTexture {
  return makeAlpha("softrect1", 64, 64, (u, v) => {
    // расстояние до края плоскости (0 на краю, 0.5 в центре)
    const d = Math.min(u, 1 - u, v, 1 - v);
    const t = Math.min(1, d / 0.22); // ширина перехода 22 % плоскости
    return t * t * (3 - 2 * t);
  });
}

/** Зерно (фаза 2, 02.11.2026): мелкий шум для bumpMap полотна — у реального
 *  ПВХ и штукатурки на фото нет идеально ровной заливки. Повтор 1/0,5 м. */
let noiseTex: THREE.DataTexture | null = null;
export function getNoiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < N * N; i++) {
    const v = Math.round(128 + (rnd() - 0.5) * 90);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  noiseTex = t;
  return t;
}

/** Небо за окном: голубое сверху → светлая дымка у горизонта (RGB, без альфы). */
let skyTex: THREE.DataTexture | null = null;
export function getSkyTexture(): THREE.DataTexture {
  if (skyTex) return skyTex;
  const h = 32;
  const data = new Uint8Array(h * 4);
  // Этап 2 (эталон 09-окно): днём стекло пересвечено почти в белый с лёгкой
  // голубизной (#EEF2F8), улица не читается. Синее небо-градиент было CG.
  const top = [0xe0, 0xe9, 0xf4];
  const bottom = [0xf4, 0xf6, 0xf9];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1); // 0 низ → 1 верх (DataTexture: первая строка = v=0)
    for (let c = 0; c < 3; c++) data[y * 4 + c] = Math.round(bottom[c] + (top[c] - bottom[c]) * t);
    data[y * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 1, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  skyTex = tex;
  return tex;
}

/** Кольцо вентиляции (этап 3): чёрное кольцо с мягким краем — ringGeometry без
 *  MSAA на expo-gl рисуется зубчатым. u,v — квадрат 2R×2R, кольцо r∈[in,out]. */
export function getVentRingTexture(): THREE.DataTexture {
  const key = "ventring2";
  const cached = cache.get(key);
  if (cached) return cached;
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  // Кольцо ≈ 7 мм при R = 52 мм: наружная кромка чёрная, к внутреннему краю
  // светлеет — фаска, как на фото диффузора; снаружи лёгкая тень 2 мм.
  const rOut = 0.46, rIn = rOut - 0.062;
  const soft = 0.01;
  const shadowW = 0.03;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5;
    const r = Math.hypot(u, v);
    let a = 0, c = 0x11;
    if (r >= rIn && r <= rOut) {
      a = 1;
      const t = (r - rIn) / (rOut - rIn); // 0 у внутреннего края … 1 снаружи
      c = Math.round(0x11 + (1 - t) * (0x5a - 0x11) * Math.pow(1 - t, 1.5)); // внутренний край #5A → наружный #11
    } else if (r > rOut) {
      const d = r - rOut;
      if (d < soft) { a = 1 - d / soft; c = 0x11; }
      else if (d < soft + shadowW) { a = 0.22 * (1 - (d - soft) / shadowW); c = 0x00; }
    } else {
      const d = rIn - r;
      if (d < soft) { a = 1 - d / soft; c = 0x5a; }
    }
    const i = (y * N + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = c; data[i + 3] = Math.round(255 * a);
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/**
 * Световая линия (10.11.2026): одна плоскость вместо двух (рамка + диффузор) с текстурой
 * 1×64 поперёк ширины — серый торец профиля 6 мм, белый диффузор 40 мм, серый 6 мм. Mipmap:
 * издали под острым углом линия усредняется в ровную светлую полосу, а две геометрические
 * плоскости рвались на пунктир (комната ERSO, линия у стены в нижнем уровне).
 */
export const LIGHTLINE_W = 0.04;
export const LIGHTLINE_FRAME = 0.006;
export function getLightLineTexture(): THREE.DataTexture {
  const key = "lightline-1x64";
  const cached = cache.get(key);
  if (cached) return cached;
  const N = 64;
  const W = LIGHTLINE_W + LIGHTLINE_FRAME * 2;
  const data = new Uint8Array(4 * N);
  for (let i = 0; i < N; i++) {
    const d = ((i + 0.5) / N) * W;
    const frame = d < LIGHTLINE_FRAME || d > W - LIGHTLINE_FRAME;
    const c = frame ? 0x6b : 0xff;
    data[i * 4] = data[i * 4 + 1] = c; data[i * 4 + 2] = frame ? 0x6e : 0xff; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 1, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}
