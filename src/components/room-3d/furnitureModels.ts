// Процедурная мебель для 3D (06.11.2026). Каждый тип — функция, которая
// складывает детали в GeoBuilder. Общие правила коллекции (оценка дизайнера,
// ~/Desktop/3d-мебель-было-стало/02-оценка-дизайнера.md):
//  • толщины, швы, ручки, ножки, цоколи заданы в метрах и НЕ масштабируются —
//    от размера мастера меняется только число модулей (створок, секций, подушек);
//  • шов между фасадами — полоса 10 мм цвета шва почти заподлицо: фасады
//    выступают над корпусом всего на 2 мм. Глубокий зазор (фасад 18 мм) под
//    углом перекрывался кромкой створки: швы пропадали уже при 25° от оси и
//    были разного веса. Чёрным шов не делаем — чем контрастнее, тем заметнее
//    лесенка; совпадающих плоскостей нет (на телефоне рябят);
//  • напольное стоит на утопленном цоколе или ножках, настенное висит с зазором;
//  • цвета — только из furniturePalette.ts.
// Локальные оси: X — ширина, Y — вверх, Z — глубина, +Z — лицо предмета.

import type * as THREE from "three";
import { GeoBuilder, rgb, shade, type RGB } from "./furnitureBuilder";
import { FURNITURE_PALETTE as P } from "./furniturePalette";
import type { FurnitureType } from "./types";

export interface FurnitureCtx {
  /** Высота потолка, м. */
  ceilingM: number;
  /** Расстояние от задней грани габарита до ближайшей стены, м (Infinity — стен рядом нет). */
  backGapM: number;
  /** То же для передней грани и для левого (−X) и правого (+X) торца. */
  frontGapM?: number;
  leftGapM?: number;
  rightGapM?: number;
  /** Кухня: этот блок короткий в Г-образной сборке, торец end упирается в блок глубиной mainDepthM. */
  kitchenJoin?: { end: "left" | "right"; mainDepthM: number };
}

/** Мягкая тень: на полу — пятно вокруг габарита, на стене — за предметом. */
export interface ShadowSpec {
  w: number;
  h: number;
  /** Ширина тающей полосы, м. */
  band: number;
  opacity: number;
  /** Центр: на полу — (x, z); на стене — (x, y) при z = wallZ. */
  cx: number;
  cy: number;
}

export interface FurnitureModel {
  geometry: THREE.BufferGeometry;
  triangles: number;
  floorShadow?: ShadowSpec;
  /** Тень на стене за предметом; z — координата плоскости стены в локальных осях. */
  wallShadow?: ShadowSpec & { z: number };
}

const SEAM = 0.01; // ширина шва между фасадами
const FRONT_T = 0.002; // на сколько фасад выступает над корпусом (плоскостью шва)
const OVERLAP = 0.001; // крайний фасад перекрывает бок корпуса
const AT_WALL = 0.08; // «стоит у стены»: зазор до стены не больше 8 см
/** Стена в сцене толщиной 6 см по оси контура: её внутренняя грань на 3 см ближе к комнате, чем линия чертежа. */
const WALL_HALF = 0.03;
/** Z внутренней грани стены за предметом в его локальных осях. */
const wallFaceZ = (d: number, ctx: FurnitureCtx) => -d / 2 - ctx.backGapM + WALL_HALF;

/** Высота отдельно стоящего шкафа: потолок минус 30 см, в пределах 2,10–2,40. */
export function wardrobeHeight(ceilingM: number): number {
  return Math.max(2.1, Math.min(2.4, ceilingM - 0.3));
}

// ───────────────────────── Шкаф (распашной) ─────────────────────────
// Створки по 40–60 см (ширина / 50), парами: ручки-скобы сходятся у общего
// шва. Цоколь 8 см утоплен на 4 см, боковины до пола. Антресольный шов на
// 2,0 м при высоте от 2,3 м. Верхняя крышка не нужна — с уровня глаз не видна,
// её роль играет верх корпуса.
function wardrobe(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx): FurnitureModel {
  const H = wardrobeHeight(ctx.ceilingM);
  const front = rgb(P.white);
  const side = shade(front, 0.96);
  const seam = rgb(P.seam);
  const DOOR_T = FRONT_T;
  const PLINTH_H = 0.08;
  const zFront = d / 2;
  const zBody = zFront - DOOR_T; // передняя плоскость корпуса (видна в швах)
  const bodyD = d - DOOR_T;
  const bodyCz = -d / 2 + bodyD / 2;

  // корпус выше цоколя: бока и верх — цвет фасада, перед — цвет шва
  b.box(0, PLINTH_H + (H - PLINTH_H) / 2, bodyCz, w, H - PLINTH_H, bodyD, side, {
    faces: { pz: seam, py: shade(front, 0.9) },
    skip: ["ny"],
    bottomK: 0.94,
  });
  // боковины до пола + утопленный цоколь
  const SIDE_T = 0.018;
  for (const sx of [-1, 1]) {
    b.box(sx * (w / 2 - SIDE_T / 2), PLINTH_H / 2, bodyCz, SIDE_T, PLINTH_H, bodyD, shade(side, 0.94), { skip: ["py", "ny"] });
  }
  if (w > SIDE_T * 2 + 0.02) {
    const plinthD = d - 0.04; // утоплен на 4 см от плоскости фасадов
    b.box(0, PLINTH_H / 2, -d / 2 + plinthD / 2, w - SIDE_T * 2, PLINTH_H, plinthD, rgb(P.plinth), { skip: ["py", "ny", "px", "nx", "nz"] });
  }

  // створки
  // Крайние створки на 1 мм перекрывают бока корпуса: вровень — на стыке граней
  // просвечивали точки цвета шва, с отступом — по краю шла пунктирная полоска.
  const EDGE = -OVERLAP;
  const n = Math.max(1, Math.round(w / 0.5));
  const doorW = (w - EDGE * 2 - SEAM * (n - 1)) / n;
  const split = H >= 2.3 ? 2.0 : null; // антресольный шов
  const y0 = PLINTH_H;
  const zDoor = zFront - DOOR_T / 2;
  const door = (cx: number, ya: number, yb: number) => {
    const h = yb - ya;
    // нижние 15 % створки чуть темнее: шкаф «стоит», а не висит плоскостью
    const shadeH = Math.min(h, H * 0.15);
    if (ya === y0 && h > shadeH + 0.01) {
      b.box(cx, ya + shadeH / 2, zDoor, doorW, shadeH, DOOR_T, front, { skip: ["nz", "py"], bottomK: 0.9 });
      b.box(cx, ya + shadeH + (h - shadeH) / 2, zDoor, doorW, h - shadeH, DOOR_T, front, { skip: ["nz", "ny"] });
    } else {
      b.box(cx, ya + h / 2, zDoor, doorW, h, DOOR_T, front, { skip: ["nz"] });
    }
  };
  const handle = rgb(P.graphite);
  const HANDLE_H = 0.32;
  const HANDLE_T = 0.012;
  const HANDLE_OUT = 0.025;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + EDGE + doorW / 2 + i * (doorW + SEAM);
    if (split) {
      door(cx, y0, split - SEAM / 2);
      door(cx, split + SEAM / 2, H);
    } else {
      door(cx, y0, H);
    }
    // ручка-скоба 32×1,2 см в 4 см от края створки у общего шва пары, центр на 1,05 м
    const toRight = i % 2 === 0;
    const hx = cx + (toRight ? 1 : -1) * (doorW / 2 - 0.04);
    b.box(hx, 1.05, zFront + HANDLE_OUT - HANDLE_T / 2, HANDLE_T, HANDLE_H, HANDLE_T, handle);
    for (const sy of [-1, 1]) {
      b.box(hx, 1.05 + sy * (HANDLE_H / 2 - 0.02), zFront + (HANDLE_OUT - HANDLE_T) / 2, HANDLE_T, HANDLE_T, HANDLE_OUT - HANDLE_T, handle, { skip: ["nz", "pz"] });
    }
  }

  const atWall = ctx.backGapM <= AT_WALL;
  return {
    geometry: b.build(),
    triangles: b.triangles,
    floorShadow: { w, h: d, band: 0.24, opacity: 0.34, cx: 0, cy: 0 },
    // полоса заходит под корпус на 1 см — иначе по задней кромке боковины на стене шёл пунктир
    wallShadow: atWall ? { w: w - 0.02, h: H - 0.02, band: 0.13, opacity: 0.2, cx: 0, cy: H / 2 - 0.01, z: wallFaceZ(d, ctx) } : undefined,
  };
}

// ───────────────────────── Телевизор ─────────────────────────
// У стены всегда висит: центр экрана 1,18 м, корпус 3 см, зазор до стены 2 см,
// мягкая тень на стене — она и даёт ощущение «висит». Глубина с чертежа на
// толщину не влияет. Экран выключен: матовый тёмный градиент, без картинки и
// бликов. Далеко от всех стен — тонкая напольная стойка.
const TV_CENTER_Y = 1.18;
function tv(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx): FurnitureModel {
  const W = Math.min(w, 2.0); // шире 2 м экран не рисуем — центрируем в габарите
  const H = W * 0.5625;
  const T = 0.03;
  const BEZEL = 0.008;
  const frame = rgb(P.tvFrame);
  const onWall = ctx.backGapM <= 0.3;
  const wallZ = onWall ? wallFaceZ(d, ctx) : -d / 2;
  const zBack = onWall ? wallZ + 0.02 : -T / 2;
  const zc = zBack + T / 2;
  const zf = zBack + T;
  // Закрытый корпус цвета рамки, экран лежит поверх с нахлёстом 1,5 мм. Перед
  // из пяти состыкованных прямоугольников давал щели на стыках — светлые точки
  // стены по кромкам чёрной панели.
  b.box(0, TV_CENTER_Y, zc, W, H, T, frame, { faces: { py: shade(frame, 0.9) } });
  b.panelZ(0, TV_CENTER_Y, zf + 0.0015, W - BEZEL * 2, H - BEZEL * 2, rgb(P.tvScreenTop), rgb(P.tvScreenBottom));

  if (onWall) {
    return {
      geometry: b.build(),
      triangles: b.triangles,
      wallShadow: { w: W - 0.02, h: H - 0.02, band: 0.11, opacity: 0.26, cx: 0, cy: TV_CENTER_Y - 0.03, z: wallZ },
    };
  }
  // напольная стойка: плита-основание и тонкая стойка до середины экрана
  const baseW = Math.min(0.6, W * 0.5);
  b.box(0, 0.012, zc, baseW, 0.024, 0.32, frame, { skip: ["ny"] });
  b.box(0, (TV_CENTER_Y - 0.1) / 2 + 0.012, zc - T / 2 - 0.02, 0.05, TV_CENTER_Y - 0.1, 0.04, frame, { skip: ["ny"] });
  return {
    geometry: b.build(),
    triangles: b.triangles,
    floorShadow: { w: baseW, h: 0.32, band: 0.14, opacity: 0.3, cx: 0, cy: zc },
  };
}

// ───────────────────────── Диван ─────────────────────────
// Прямой современный: блочные подлокотники 18 см, спинка с наклоном 8°,
// подушки сиденья 14 см на основании 19 см (выступают за фасад на 2 см),
// подушки спинки по ~75 см (число — от ширины), скруглённые кромки, ножки 10 см.
// Глубже 1,35 м — угловой: оттоманка 90 см на том конце, что ближе к боковой
// стене (нет стен рядом — справа), с такой же подушкой сиденья.
function sofa(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx, single = false): FurnitureModel {
  const fabric = rgb(P.fabric);
  const dark = rgb(P.fabricDark);
  const ARM_W = Math.min(0.18, w * 0.16);
  const ARM_H = 0.6;
  const LEG = 0.1;
  const BASE_TOP = 0.29;
  const SEAT_TOP = 0.43;
  const BACK_H = 0.8;
  const BACK_T = 0.2;
  const BACK_TILT = 0.14; // 8°
  const R = 0.03;
  const corner = !single && d > 1.35 && w > 1.9;
  const mainD = corner ? 0.95 : d;
  const zBack = -d / 2;
  const mainCz = zBack + mainD / 2;
  const ottoRight = corner ? (ctx.rightGapM ?? Infinity) <= (ctx.leftGapM ?? Infinity) : false;

  // основание и подлокотники основной части
  b.softBox(0, (LEG + BASE_TOP) / 2, mainCz, w, BASE_TOP - LEG, mainD, 0.02, dark, { bottomK: 0.9 });
  for (const sx of [-1, 1]) {
    b.softBox(sx * (w / 2 - ARM_W / 2), LEG + (ARM_H - LEG) / 2, mainCz, ARM_W, ARM_H - LEG, mainD, R, fabric, { bottomK: 0.92 });
  }
  // спинка между подлокотниками, наклон назад
  const innerW = w - ARM_W * 2;
  b.softBox(0, LEG + (BACK_H - LEG) / 2, zBack + BACK_T / 2 + 0.03, innerW, BACK_H - LEG, BACK_T, R, fabric, { rot: [-BACK_TILT, 0, 0], bottomK: 0.92 });

  // подушки сиденья (выступают за фасад основания на 2 см) и спинки
  const n = single ? 1 : Math.max(1, Math.round(innerW / 0.75));
  const GAP = 0.01;
  const cw = (innerW - GAP * (n - 1)) / n;
  const seatZ0 = zBack + BACK_T;
  const seatD = mainD - BACK_T + 0.02;
  const ottoIdx = corner ? (ottoRight ? n - 1 : 0) : -1;
  for (let i = 0; i < n; i++) {
    const cx = -innerW / 2 + cw / 2 + i * (cw + GAP);
    b.softBox(cx, (BASE_TOP + SEAT_TOP) / 2, seatZ0 + seatD / 2, cw, SEAT_TOP - BASE_TOP, seatD, R, fabric);
    b.softBox(cx, SEAT_TOP + 0.19, seatZ0 + 0.09, cw - 0.02, 0.4, 0.15, 0.04, fabric, { rot: [-BACK_TILT, 0, 0], bottomK: 0.95 });
    if (i === ottoIdx) {
      // оттоманка: основание вперёд на всю глубину и своя подушка сиденья через зазор
      const od = d - mainD;
      b.softBox(cx, (LEG + BASE_TOP) / 2, zBack + mainD + od / 2, cw + 0.02, BASE_TOP - LEG, od, 0.02, dark, { bottomK: 0.9 });
      const oz0 = seatZ0 + seatD + GAP;
      const odC = d / 2 + 0.01 - oz0;
      b.softBox(cx, (BASE_TOP + SEAT_TOP) / 2, oz0 + odC / 2, cw, SEAT_TOP - BASE_TOP, odC, R, fabric);
    }
  }
  // декоративные подушки у подлокотников: тонкие, мягкие, с наклоном к спинке,
  // нижняя кромка утоплена в сиденье; тон почти как у спинки
  if (!single && innerW > 1.3) {
    const pc = shade(fabric, 1.05);
    for (const sx of [-1, 1]) {
      b.softBox(sx * (innerW / 2 - 0.24), SEAT_TOP - 0.02 + 0.2, seatZ0 + 0.25, 0.42, 0.42, 0.1, 0.045, pc, { rot: [-0.26, 0, 0] });
    }
  }
  // ножки — только по углам
  const g = rgb(P.graphite);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * (w / 2 - 0.08), LEG / 2, mainCz + sz * (mainD / 2 - 0.08), 0.04, LEG, 0.04, g, { skip: ["py", "ny"] });
  }
  return {
    geometry: b.build(),
    triangles: b.triangles,
    floorShadow: { w, h: mainD, band: 0.2, opacity: 0.32, cx: 0, cy: mainCz },
  };
}

// ───────────────────────── Общие детали корпусной мебели ─────────────────────────
/** Ряд фасадов одинаковой ширины с настоящими зазорами; rows — границы по высоте [низ, верх][]. */
function fronts(b: GeoBuilder, x0: number, x1: number, zFront: number, cols: number, rows: Array<[number, number]>, color: RGB, bottomK = 1) {
  // крайние фасады на 1 мм перекрывают бока корпуса (см. шкаф)
  const xa = x0 - OVERLAP;
  const cw = (x1 - x0 + OVERLAP * 2 - SEAM * (cols - 1)) / cols;
  for (let i = 0; i < cols; i++) {
    const cx = xa + cw / 2 + i * (cw + SEAM);
    rows.forEach(([ya, yb], r) => {
      b.box(cx, (ya + yb) / 2, zFront - FRONT_T / 2, cw, yb - ya, FRONT_T, color, { skip: ["nz"], bottomK: r === 0 ? bottomK : 1 });
    });
  }
}

/** Число модулей по ширине: шаг step, не меньше одного. */
const modules = (w: number, step: number) => Math.max(1, Math.round(w / step));

// ───────────────────────── Кровать ─────────────────────────
// Мягкий короб до пола на утопленном цоколе, матрас (верх на 50 см), покрывало
// на 75 % длины со свесом, отворот белья, подушки с наклоном к изголовью,
// изголовье 1,08 м из вертикальных сегментов.
// Три варианта раскладки (решает Нариман по картинкам 05-кровать-1/2):
//   "icon"  — А: изголовье там, где подушки на 2D-значке (сторона ширины), длина = глубина;
//   "real"  — Б: длина = длинная сторона габарита, изголовье на короткой стороне,
//             которая ближе к стене;
//   "shape" — В, по форме: отношение сторон < 0,75 (односпальная) — как Б;
//             иначе (двуспальная) — изголовье к той стороне, что касается стены,
//             посреди комнаты — по значку.
// За габарит мастера не выходим ни в одном варианте.
export const BED_LAYOUT: "icon" | "real" | "shape" = "shape";

function bedBody(b: GeoBuilder, bw: number, bl: number) {
  const fabric = rgb(P.fabricDark);
  const linen = rgb(P.linen);
  const spread = rgb(P.linenDark);
  const HEAD_T = 0.09;
  const HEAD_H = 1.08;
  const BASE_TOP = 0.28;
  const MAT_TOP = 0.5;
  const zHead = -bl / 2;
  // цоколь и короб
  b.box(0, 0.025, 0, bw - 0.08, 0.05, bl - 0.08, rgb(P.plinth), { skip: ["py", "ny"] });
  b.softBox(0, (0.05 + BASE_TOP) / 2, HEAD_T / 2, bw, BASE_TOP - 0.05, bl - HEAD_T, 0.02, shade(fabric, 0.92), { bottomK: 0.9 });
  // изголовье: подложка + сегменты с канавками 1 см
  b.box(0, HEAD_H / 2, zHead + 0.02, bw, HEAD_H, 0.04, shade(fabric, 0.82), { skip: ["ny"] });
  const segs = modules(bw, 0.38);
  const sw = (bw - 0.01 * (segs - 1)) / segs;
  for (let i = 0; i < segs; i++) {
    b.softBox(-bw / 2 + sw / 2 + i * (sw + 0.01), 0.05 + (HEAD_H - 0.05) / 2, zHead + 0.04 + (HEAD_T - 0.04) / 2 + 0.005, sw, HEAD_H - 0.05, HEAD_T - 0.03, 0.02, fabric, { bottomK: 0.94 });
  }
  // матрас
  const mw = bw - 0.04;
  const ml = bl - HEAD_T - 0.04;
  const mz = zHead + HEAD_T + 0.01 + ml / 2;
  b.softBox(0, (BASE_TOP + MAT_TOP) / 2, mz, mw, MAT_TOP - BASE_TOP, ml, 0.05, linen);
  // подушки с наклоном к изголовью
  const two = bw >= 1.4;
  const pw = two ? Math.min(0.7, (mw - 0.07 - 0.06) / 2) : Math.min(0.7, mw - 0.1);
  const PD = Math.min(0.5, ml * 0.3);
  const pz = zHead + HEAD_T + 0.05 + PD / 2;
  const xs = two ? [-(pw / 2 + 0.035), pw / 2 + 0.035] : [0];
  for (const x of xs) b.softBox(x, MAT_TOP + 0.11, pz, pw, 0.16, PD, 0.06, linen, { rot: [-0.26, 0, 0] });
  // покрывало от изножья до отворота белья; отворот 22 см сразу за подушками
  const footZ = mz + ml / 2 + 0.03;
  const foldZ0 = pz + PD / 2 - 0.03;
  const FOLD = Math.min(0.22, ml * 0.14);
  const sl = footZ - (foldZ0 + FOLD);
  b.softBox(0, MAT_TOP - 0.065, footZ - sl / 2, mw + 0.06, 0.2, sl, 0.045, spread, { bottomK: 0.93 });
  b.softBox(0, MAT_TOP + 0.02, foldZ0 + FOLD / 2 + 0.01, mw + 0.065, 0.07, FOLD + 0.02, 0.03, linen);
}

type BedHead = "back" | "front" | "left" | "right";

function bedHeadSide(w: number, d: number, ctx: FurnitureCtx): BedHead {
  const gaps = { back: ctx.backGapM, front: ctx.frontGapM ?? Infinity, left: ctx.leftGapM ?? Infinity, right: ctx.rightGapM ?? Infinity };
  const longAlongX = w > d + 0.01;
  const shortEnd = (): BedHead => (longAlongX ? (gaps.left <= gaps.right ? "left" : "right") : gaps.back <= gaps.front ? "back" : "front");
  if (BED_LAYOUT === "real") return longAlongX ? shortEnd() : "back";
  if (BED_LAYOUT === "shape") {
    if (Math.min(w, d) / Math.max(w, d) < 0.75) return shortEnd();
    const sides = (Object.keys(gaps) as BedHead[]).sort((a, c) => gaps[a] - gaps[c]);
    return gaps[sides[0]] <= AT_WALL ? sides[0] : "back";
  }
  return "back";
}

function bed(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx): FurnitureModel {
  const head = bedHeadSide(w, d, ctx);
  const sideways = head === "left" || head === "right";
  bedBody(b, sideways ? d : w, sideways ? w : d);
  const g = b.build();
  // изголовье строится на −Z; поворот на +90° переносит его на −X, на −90° — на +X, на 180° — на +Z
  if (head === "left") g.rotateY(Math.PI / 2);
  else if (head === "right") g.rotateY(-Math.PI / 2);
  else if (head === "front") g.rotateY(Math.PI);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return { geometry: g, triangles: b.triangles, floorShadow: { w, h: d, band: 0.15, opacity: 0.32, cx: 0, cy: 0 } };
}

// ───────────────────────── Кухня ─────────────────────────
// Низ: модули по ~60 см, фасады со швами, цоколь 10 см утоплен на 5 см, вместо
// ручек — тёмная полоса 3 см под столешницей. Столешница 4 см со свесом
// вперёд. У стены — фартук и верхние шкафы глубиной 32 см. От 1,2 м —
// варочная панель, от 1,8 м — ещё мойка со смесителем. Торцы без свесов:
// блоки стыкуются в Г-образную кухню.
function kitchen(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx): FurnitureModel {
  const low = rgb(P.grey);
  const up = rgb(P.white);
  const oak = rgb(P.oak);
  const dark = rgb(P.plinth);
  const PL = 0.1;
  const BASE_TOP = 0.86;
  const TOP = 0.9;
  const zFront = d / 2;
  const bodyD = d - FRONT_T;
  const n = modules(w, 0.6);
  // цоколь, корпус, тёмная полоса-ручка
  b.box(0, PL / 2, -d / 2 + (d - 0.05) / 2, w, PL, d - 0.05, dark, { skip: ["py", "ny", "nz"] });
  b.box(0, (PL + BASE_TOP) / 2, -d / 2 + bodyD / 2, w, BASE_TOP - PL, bodyD, shade(low, 0.96), { faces: { pz: rgb(P.seam) }, skip: ["ny", "py"], bottomK: 0.94 });
  b.box(0, BASE_TOP - 0.015, zFront - FRONT_T + 0.0005, w, 0.03, 0.001, dark, { skip: ["nz", "py"] });
  fronts(b, -w / 2, w / 2, zFront, n, [[PL, BASE_TOP - 0.03 - SEAM]], low, 0.92);

  // столешница (свес вперёд 2 см); при мойке собирается вокруг выреза
  const ctD = d + 0.02;
  const ctZ = -d / 2 + ctD / 2;
  const join = ctx.kitchenJoin;
  const hasHob = !join && w >= 1.2 && d >= 0.5;
  const hasSink = !join && w >= 1.8 && d >= 0.5;
  const hobX = hasSink ? -w / 4 : 0;
  const sinkX = w / 4;
  const SW = 0.5;
  const SD = 0.4;
  const sinkZ = 0.01;
  // короткий блок: столешница не доходит до торца на свес главного блока (иначе две
  // столешницы в одной плоскости мерцают в углу)
  const trimL = join?.end === "left" ? 0.025 : 0;
  const trimR = join?.end === "right" ? 0.025 : 0;
  if (!hasSink) {
    b.box((trimL - trimR) / 2, (BASE_TOP + TOP) / 2, ctZ, w - trimL - trimR, TOP - BASE_TOP, ctD, oak, { skip: ["ny"] });
  } else {
    const yc = (BASE_TOP + TOP) / 2;
    const th = TOP - BASE_TOP;
    const xL = sinkX - SW / 2;
    const xR = sinkX + SW / 2;
    const zB = sinkZ - SD / 2;
    const zF = sinkZ + SD / 2;
    b.box((-w / 2 + xL) / 2, yc, ctZ, xL + w / 2, th, ctD, oak, { skip: ["ny", "px"] });
    b.box((xR + w / 2) / 2, yc, ctZ, w / 2 - xR, th, ctD, oak, { skip: ["ny", "nx"] });
    b.box(sinkX, yc, (-d / 2 + zB) / 2, SW, th, zB + d / 2, oak, { skip: ["ny", "px", "nx"] });
    b.box(sinkX, yc, (zF + ctZ + ctD / 2) / 2, SW, th, ctZ + ctD / 2 - zF, oak, { skip: ["ny", "px", "nx"] });
    // чаша: серое углубление 12 см
    const steel = rgb(P.grey);
    const by = TOP - 0.12;
    b.quad([[xL, by, zF], [xR, by, zF], [xR, by, zB], [xL, by, zB]], [0, 1, 0], shade(steel, 0.8));
    b.quad([[xL, by, zB], [xR, by, zB], [xR, TOP, zB], [xL, TOP, zB]], [0, 0, 1], shade(steel, 0.9));
    b.quad([[xR, by, zF], [xL, by, zF], [xL, TOP, zF], [xR, TOP, zF]], [0, 0, -1], shade(steel, 0.75));
    b.quad([[xL, by, zF], [xL, by, zB], [xL, TOP, zB], [xL, TOP, zF]], [1, 0, 0], shade(steel, 0.85));
    b.quad([[xR, by, zB], [xR, by, zF], [xR, TOP, zF], [xR, TOP, zB]], [-1, 0, 0], shade(steel, 0.85));
    // смеситель: стойка и излив
    b.cyl(sinkX, TOP + 0.11, zB - 0.05, 0.013, 0.22, steel, "y", 6);
    b.box(sinkX, TOP + 0.21, zB - 0.05 + 0.075, 0.024, 0.024, 0.17, steel);
  }
  if (hasHob) b.box(hobX, TOP + 0.003, 0.01, 0.58, 0.006, Math.min(0.5, d - 0.08), rgb(P.graphite), { skip: ["ny"] });

  // у стены: фартук и верхние шкафы
  const atWall = ctx.backGapM <= AT_WALL;
  let wall: FurnitureModel["wallShadow"];
  if (atWall) {
    const wz = wallFaceZ(d, ctx);
    b.box(0, (TOP + 1.45) / 2, wz + 0.006, w, 1.45 - TOP, 0.012, rgb(P.backsplash), { skip: ["nz", "ny", "py"] });
    const uTop = Math.min(2.17, ctx.ceilingM - 0.25);
    if (uTop - 1.45 >= 0.4) {
      const UD = 0.32;
      const uzF = wz + UD;
      // у короткого блока верхние шкафы доводятся до верхних шкафов главного (иначе в углу ниша стены)
      const ext = join ? Math.max(0, join.mainDepthM - UD) : 0;
      const ux0 = -w / 2 - (join?.end === "left" ? ext : 0);
      const ux1 = w / 2 + (join?.end === "right" ? ext : 0);
      b.box((ux0 + ux1) / 2, (1.45 + uTop) / 2, wz + (UD - FRONT_T) / 2, ux1 - ux0, uTop - 1.45, UD - FRONT_T, shade(up, 0.96), { faces: { pz: rgb(P.seam), ny: shade(up, 0.78) }, skip: ["nz"] });
      fronts(b, ux0, ux1, uzF, modules(ux1 - ux0, 0.6), [[1.45, uTop]], up);
      wall = { w, h: uTop - 1.45, band: 0.1, opacity: 0.22, cx: 0, cy: (1.45 + uTop) / 2 - 0.03, z: wz };
    }
  }
  return {
    geometry: b.build(),
    triangles: b.triangles,
    floorShadow: { w, h: d, band: 0.24, opacity: 0.34, cx: 0, cy: 0 },
    wallShadow: wall,
  };
}

// ───────────────────────── Стол обеденный ─────────────────────────
// Столешница 3 см со свесом, царга утоплена, ножки с отступом от края.
function table(b: GeoBuilder, w: number, d: number): FurnitureModel {
  const H = 0.75;
  const TOP_T = 0.03;
  const LEG = 0.045;
  const g = rgb(P.graphite);
  b.box(0, H - TOP_T / 2, 0, w, TOP_T, d, rgb(P.oak), { faces: { ny: shade(rgb(P.oak), 0.7) } });
  if (w > 0.4 && d > 0.4) b.box(0, H - TOP_T - 0.035, 0, w - 0.16, 0.07, d - 0.16, rgb(P.oakDark), { skip: ["py"] });
  const lx = Math.max(0.03, w / 2 - 0.06 - LEG / 2);
  const lz = Math.max(0.03, d / 2 - 0.06 - LEG / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * lx, (H - TOP_T) / 2, sz * lz, LEG, H - TOP_T, LEG, g, { skip: ["py", "ny"] });
  return { geometry: b.build(), triangles: b.triangles, floorShadow: { w: w - 0.1, h: d - 0.1, band: 0.18, opacity: 0.2, cx: 0, cy: 0 } };
}

// ───────────────────────── Рабочий стол ─────────────────────────
// Столешница на боковинах, справа тумба с тремя ящиками, сзади планка 30 см.
// Уже 90 см — две боковины без тумбы.
function desk(b: GeoBuilder, w: number, d: number): FurnitureModel {
  const H = 0.75;
  const TOP_T = 0.025;
  const white = rgb(P.white);
  const oak = rgb(P.oak);
  const under = H - TOP_T;
  b.box(0, H - TOP_T / 2, 0, w, TOP_T, d, oak, { faces: { ny: shade(oak, 0.7) } });
  const SIDE_T = 0.022;
  const inset = 0.02;
  b.box(-w / 2 + inset + SIDE_T / 2, under / 2, 0, SIDE_T, under, d - 0.04, white, { skip: ["py", "ny"], bottomK: 0.92 });
  const PED = 0.4;
  if (w >= 0.9) {
    const px = w / 2 - inset - PED / 2;
    const pd = d - 0.04;
    const zF = pd / 2;
    b.box(px, 0.03 + (under - 0.03) / 2, -FRONT_T / 2, PED, under - 0.03, pd - FRONT_T, shade(white, 0.96), { faces: { pz: rgb(P.seam) }, skip: ["py", "ny"], bottomK: 0.92 });
    b.box(px, 0.015, -0.02, PED - 0.02, 0.03, pd - 0.06, rgb(P.plinth), { skip: ["py", "ny"] });
    const top = under - 0.01;
    const dh = (top - 0.03 - SEAM * 2) / 3;
    const rows: Array<[number, number]> = [0, 1, 2].map((i) => [0.03 + i * (dh + SEAM), 0.03 + i * (dh + SEAM) + dh]);
    fronts(b, px - PED / 2, px + PED / 2, zF, 1, rows, white, 0.94);
  } else {
    b.box(w / 2 - inset - SIDE_T / 2, under / 2, 0, SIDE_T, under, d - 0.04, white, { skip: ["py", "ny"], bottomK: 0.92 });
  }
  // задняя планка под столешницей
  const bx0 = -w / 2 + inset + SIDE_T;
  const bx1 = w >= 0.9 ? w / 2 - inset - PED : w / 2 - inset - SIDE_T;
  if (bx1 - bx0 > 0.1) b.box((bx0 + bx1) / 2, under - 0.15, -d / 2 + 0.05, bx1 - bx0, 0.3, 0.018, shade(white, 0.94), { skip: ["py"] });
  return { geometry: b.build(), triangles: b.triangles, floorShadow: { w: w - 0.04, h: d - 0.04, band: 0.16, opacity: 0.24, cx: 0, cy: 0 } };
}

// ───────────────────────── Стул ─────────────────────────
// Лёгкий обеденный: мягкое сиденье, наклонная спинка, тонкие ножки. Размер не
// тянется — только равномерный масштаб до 1,2 под габарит мастера.
function chair(b: GeoBuilder, w: number, d: number): FurnitureModel {
  const fabric = rgb(P.fabricDark);
  const g = rgb(P.graphite);
  const S = 0.45;
  b.softBox(0, 0.42, 0.01, S, 0.06, S - 0.02, 0.02, fabric);
  b.softBox(0, 0.66, -S / 2 + 0.04, 0.4, 0.38, 0.055, 0.02, fabric, { rot: [-0.14, 0, 0] });
  for (const sx of [-1, 1]) {
    b.box(sx * (S / 2 - 0.035), 0.195, S / 2 - 0.045, 0.03, 0.39, 0.03, g, { skip: ["py", "ny"] });
    // задняя ножка продолжается стойкой спинки
    b.box(sx * (S / 2 - 0.035), 0.195, -S / 2 + 0.035, 0.03, 0.39, 0.03, g, { skip: ["py", "ny"] });
    b.box(sx * (S / 2 - 0.06), 0.47, -S / 2 + 0.025, 0.025, 0.1, 0.025, g, { rot: [-0.14, 0, 0], skip: ["ny"] });
  }
  const k = Math.max(0.85, Math.min(1.2, Math.min(w, d) / S));
  const geo = b.build();
  geo.scale(k, k, k);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geometry: geo, triangles: b.triangles, floorShadow: { w: S * k - 0.06, h: S * k - 0.06, band: 0.13, opacity: 0.2, cx: 0, cy: 0 } };
}

// ───────────────────────── Тумбочка / низкая тумба ─────────────────────────
// Корпус строго по габариту мастера, высота 45 см, ножки 10 см, два ящика;
// шире 90 см делится на колонки — так тумбочка закрывает и «тумбу под ТВ».
function nightstand(b: GeoBuilder, w: number, d: number): FurnitureModel {
  const oak = rgb(P.oak);
  const H = 0.45;
  const LEG = 0.1;
  const TOP_T = 0.02;
  const bodyD = d - FRONT_T - 0.005;
  const zFront = d / 2 - 0.005;
  b.box(0, LEG + (H - TOP_T - LEG) / 2, -d / 2 + bodyD / 2, w - 0.01, H - TOP_T - LEG, bodyD, shade(oak, 0.96), { faces: { pz: rgb(P.seam) }, skip: ["py"], bottomK: 0.92 });
  b.box(0, H - TOP_T / 2, 0, w, TOP_T, d, oak, { faces: { ny: shade(oak, 0.7) } });
  const cols = w > 0.9 ? modules(w, 0.5) : 1;
  const y0 = LEG + 0.004;
  const y1 = H - TOP_T - 0.006;
  const dh = (y1 - y0 - SEAM) / 2;
  fronts(b, -w / 2 + 0.005, w / 2 - 0.005, zFront, cols, [[y0, y0 + dh], [y0 + dh + SEAM, y1]], rgb(P.white), 0.95);
  const g = rgb(P.graphite);
  const lx = Math.max(0.02, w / 2 - 0.045);
  const lz = Math.max(0.02, d / 2 - 0.045);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * lx, LEG / 2, sz * lz, 0.03, LEG, 0.03, g, { skip: ["py", "ny"] });
  return { geometry: b.build(), triangles: b.triangles, floorShadow: { w: w - 0.02, h: d - 0.02, band: 0.13, opacity: 0.26, cx: 0, cy: 0 } };
}

// ───────────────────────── Радиатор ─────────────────────────
// Секционный: шаг 8 см, высота 56 см, низ на 12 см от пола, у стены висит с
// зазором 4 см. Передние пластины секций со срезанным верхом, между ними
// канавки 8 мм до сердцевины; с правого края две трубы подводки.
function radiator(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx): FurnitureModel {
  const body = rgb(P.linen);
  const groove = rgb(P.linenGroove);
  const STEP = 0.08;
  const n = Math.max(3, Math.round(w / STEP));
  const W = n * STEP;
  const H = 0.56;
  const Y0 = 0.12;
  const DEPTH = 0.09;
  const atWall = ctx.backGapM <= 0.3;
  const wz = atWall ? wallFaceZ(d, ctx) : -d / 2;
  const zBack = atWall ? wz + 0.04 : -DEPTH / 2;
  const zFront = zBack + DEPTH;
  // сердцевина (видна в канавках и сверху)
  b.box(0, Y0 + H / 2 - 0.01, zBack + (DEPTH - 0.015) / 2, W - 0.008, H - 0.04, DEPTH - 0.015, groove, { skip: ["ny"] });
  const PW = STEP - 0.008;
  const PT = 0.03;
  const CH = 0.03; // срез верха 45°
  for (let i = 0; i < n; i++) {
    const cx = -W / 2 + STEP / 2 + i * STEP;
    const x0 = cx - PW / 2, x1 = cx + PW / 2;
    const yb = Y0, yt = Y0 + H - CH;
    b.box(cx, (yb + yt) / 2, zFront - PT / 2, PW, yt - yb, PT, body, { skip: ["nz", "py"], bottomK: 0.95 });
    b.quad([[x0, yt, zFront], [x1, yt, zFront], [x1, yt + CH, zFront - PT], [x0, yt + CH, zFront - PT]], [0, 0.707, 0.707], shade(body, 0.97));
  }
  // подводка: две трубы от пола к нижнему и верхнему коллектору справа
  const px = W / 2 + 0.035;
  const pz = zBack + 0.035;
  b.cyl(px, (Y0 + 0.05) / 2, pz, 0.011, Y0 + 0.05, body, "y", 6);
  b.cyl(px - 0.02, Y0 + 0.05, pz, 0.011, 0.05, body, "x", 6);
  b.cyl(px + 0.03, (Y0 + H - 0.06) / 2, pz, 0.011, Y0 + H - 0.06, body, "y", 6);
  b.cyl(px - 0.005, Y0 + H - 0.06, pz, 0.011, 0.09, body, "x", 6);
  return {
    geometry: b.build(),
    triangles: b.triangles,
    wallShadow: atWall ? { w: W, h: H, band: 0.07, opacity: 0.2, cx: 0, cy: Y0 + H / 2 - 0.02, z: wz } : undefined,
    floorShadow: atWall ? undefined : { w: W, h: DEPTH, band: 0.1, opacity: 0.16, cx: 0, cy: 0 },
  };
}

// ───────────────────────── Стенка ─────────────────────────
// Глубина до 15 см — плоская стеновая панель под дуб (2,1 м, швы через 60 см).
// От 2,4 м — пеналы 2,0 м по краям, между ними низкая тумба и верхний ряд
// шкафов: в центре остаётся место под ТВ. 1,2–2,4 м — один пенал и тумба.
// Уже 1,2 м — стеллаж: глухой низ и три открытые полки.
function wallPanel(b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx): FurnitureModel {
  const white = rgb(P.white);
  const oak = rgb(P.oak);
  const oakDark = rgb(P.oakDark);
  const atWall = ctx.backGapM <= AT_WALL;
  const wz = wallFaceZ(d, ctx);

  if (d <= 0.15) {
    const T = 0.03;
    const zBack = atWall ? wz : -d / 2;
    const HP = Math.min(2.1, ctx.ceilingM - 0.2);
    const Y0 = 0.07;
    const n = modules(w, 0.6);
    b.box(0, (Y0 + HP) / 2, zBack + 0.006, w, HP - Y0, 0.012, rgb(P.seam), { skip: ["nz"] });
    const pw = (w - SEAM * (n - 1)) / n;
    for (let i = 0; i < n; i++) b.box(-w / 2 + pw / 2 + i * (pw + SEAM), (Y0 + HP) / 2, zBack + 0.012 + (T - 0.012) / 2, pw, HP - Y0, T - 0.012, oak, { skip: ["nz"], bottomK: 0.94 });
    return {
      geometry: b.build(),
      triangles: b.triangles,
      wallShadow: atWall ? { w, h: HP - Y0, band: 0.06, opacity: 0.14, cx: 0, cy: (Y0 + HP) / 2, z: wz } : undefined,
    };
  }

  const PL = 0.06;
  const zFront = d / 2;
  const bodyD = d - FRONT_T;
  const bodyCz = -d / 2 + bodyD / 2;
  const TALL_H = Math.min(2.0, ctx.ceilingM - 0.3);
  /** Закрытый шкаф: корпус под дуб, фасады белые. */
  const cabinet = (x0: number, x1: number, y0: number, y1: number, cols: number, rows: Array<[number, number]>, depth = d) => {
    const zf = -d / 2 + depth;
    const bd = depth - FRONT_T;
    b.box((x0 + x1) / 2, (y0 + y1) / 2, -d / 2 + bd / 2, x1 - x0, y1 - y0, bd, shade(oak, 0.96), { faces: { pz: rgb(P.seam), ny: shade(oak, 0.75) }, skip: [], bottomK: y0 < 0.1 ? 0.93 : 1 });
    fronts(b, x0, x1, zf, cols, rows, white, y0 < 0.1 ? 0.94 : 1);
  };
  b.box(0, PL / 2, -d / 2 + (d - 0.04) / 2, w - 0.02, PL, d - 0.04, rgb(P.plinth), { skip: ["py", "ny"] });

  if (w < 1.2) {
    // стеллаж: глухой низ 0,7 м + открытые полки
    const H = Math.min(1.9, ctx.ceilingM - 0.3);
    const LOW = 0.7;
    cabinet(-w / 2, w / 2, PL, LOW, modules(w, 0.5), [[PL, LOW]]);
    const ST = 0.022;
    for (const sx of [-1, 1]) b.box(sx * (w / 2 - ST / 2), (LOW + H) / 2, bodyCz, ST, H - LOW, bodyD, oak, { skip: ["ny"] });
    b.box(0, (LOW + H) / 2, -d / 2 + 0.009, w - ST * 2, H - LOW, 0.018, oakDark, { skip: ["nz", "px", "nx"] });
    const shelves = 3;
    for (let i = 1; i <= shelves; i++) {
      const y = LOW + ((H - LOW) * i) / shelves - ST / 2;
      b.box(0, y, bodyCz, w - ST * 2, ST, bodyD, oak, { skip: ["px", "nx", "nz"] });
    }
    return {
      geometry: b.build(),
      triangles: b.triangles,
      floorShadow: { w, h: d, band: 0.14, opacity: 0.3, cx: 0, cy: 0 },
      wallShadow: atWall ? { w, h: H, band: 0.08, opacity: 0.14, cx: 0, cy: H / 2, z: wz } : undefined,
    };
  }

  const TW = Math.min(0.55, w * 0.22); // ширина пенала
  const two = w >= 2.4;
  const midX0 = -w / 2 + TW;
  const midX1 = two ? w / 2 - TW : w / 2;
  const LOW_TOP = 0.45;
  const split = Math.min(1.3, TALL_H - 0.5);
  cabinet(-w / 2, midX0, PL, TALL_H, 1, [[PL, split - SEAM / 2], [split + SEAM / 2, TALL_H]]);
  if (two) cabinet(midX1, w / 2, PL, TALL_H, 1, [[PL, split - SEAM / 2], [split + SEAM / 2, TALL_H]]);
  // низкая тумба между пеналами + столешница
  const mw = midX1 - midX0;
  cabinet(midX0, midX1, PL, LOW_TOP - 0.02, modules(mw, 0.6), [[PL, LOW_TOP - 0.02]]);
  b.box((midX0 + midX1) / 2, LOW_TOP - 0.01, 0.005, mw, 0.02, d + 0.01, oak, { skip: ["ny"] });
  // верхний ряд шкафов (только между двумя пеналами)
  const upper = two && TALL_H >= 1.9;
  if (upper) {
    const UD = Math.min(d, 0.32);
    cabinet(midX0, midX1, TALL_H - 0.35, TALL_H, modules(mw, 0.6), [[TALL_H - 0.35, TALL_H]], UD);
  }
  // задняя панель ниши тоном темнее корпуса: стенка читается одним предметом,
  // а не рамкой вокруг куска стены; ТВ, если мастер его поставил, висит перед ней
  const nicheTop = upper ? TALL_H - 0.35 : TALL_H - 0.35;
  const backZ = atWall ? wz : -d / 2;
  b.box((midX0 + midX1) / 2, (LOW_TOP + nicheTop) / 2, backZ + 0.006, mw, nicheTop - LOW_TOP, 0.012, rgb(P.niche), { skip: ["nz", "px", "nx", "ny"] });
  return {
    geometry: b.build(),
    triangles: b.triangles,
    floorShadow: { w, h: d, band: 0.24, opacity: 0.34, cx: 0, cy: 0 },
    wallShadow: atWall ? { w, h: TALL_H, band: 0.12, opacity: 0.2, cx: 0, cy: TALL_H / 2, z: wz } : undefined,
  };
}

const BUILDERS: Partial<Record<FurnitureType, (b: GeoBuilder, w: number, d: number, ctx: FurnitureCtx) => FurnitureModel>> = {
  wardrobe,
  tv,
  sofa,
  armchair: (b, w, d, ctx) => sofa(b, w, d, ctx, true),
  bed,
  kitchen,
  table,
  desk,
  chair,
  nightstand,
  tv_stand: nightstand,
  radiator,
  wall_panel: wallPanel,
  shelf: wallPanel,
};

/** Есть ли у типа модель (все типы мобилки и старые tv_stand/shelf/armchair). */
export function hasFurnitureModel(type: FurnitureType): boolean {
  return BUILDERS[type] !== undefined;
}

/** Размеры мастера с защитой от мусора в данных (в базе встречалась тумбочка 3000×50). */
export function buildFurnitureModel(type: FurnitureType, widthM: number, depthM: number, ctx: FurnitureCtx): FurnitureModel | null {
  const build = BUILDERS[type];
  if (!build) return null;
  const w = Math.max(0.2, Math.min(8, widthM));
  const d = Math.max(0.05, Math.min(4, depthM));
  return build(new GeoBuilder(), w, d, ctx);
}
