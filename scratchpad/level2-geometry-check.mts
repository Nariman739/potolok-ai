// Юнит-проверка формул «2 уровня» (08.11.2026): прямоугольник 4×3, Г-образный контур,
// радиус, контур у стены, два контура, контур внутри контура, узкая полка, минус полотна.
// npx tsx --tsconfig tsconfig.json scratchpad/level2-geometry-check.mts
import { calcLevel2, calcRoomLevel2, canvasAfterLevel2, level2Params, level2Path, LEVEL2_DEFAULTS, densify, offsetEdgesInward, clipOffsetOvershoot, filletPolygon, selfIntersects } from "@/lib/level2-geometry";
import type { RoomElement } from "@/lib/room-types";

let fails = 0;
const close = (a: number, b: number, eps = 0.011) => Math.abs(a - b) <= eps;
function check(name: string, got: number, want: number, eps?: number) {
  const ok = close(got, want, eps);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${got} (ожидали ${want})`);
}

const room = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
const rect = [{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }]; // 280×180, 60 см от стен
const P = (shelf: number, radius: number, led = true) => ({ ...LEVEL2_DEFAULTS, shelfCm: shelf, radiusCm: radius, led });
/** Открытая линия борта (концы на стенах). */
const O = (extra: Partial<typeof LEVEL2_DEFAULTS>) => ({ ...LEVEL2_DEFAULTS, radiusCm: 0, closed: false, ...extra });

console.log("— Прямоугольник 4×3, контур 280×180, полка 10, R20 —");
let c = calcLevel2(rect, room, P(10, 20));
// ручной счёт: P = 9,20 − 4·0,2·(2 − π/2) = 8,857; A_C = 5,04 − 4·0,04·(1 − π/4) = 5,006; U = 260×160 R10 → 4,16 − 4·0,01·0,2146 = 4,151
check("борт, м", c.bortM, 8.86);
check("подсветка, м", c.ledM, 8.86);
check("площадь внутри борта, м²", c.cutM2, 5.01);
check("верхнее полотно, м²", c.upperM2, 4.15);
check("полка, м²", c.shelfM2, 0.85);
check("нижнее полотно 12 − 5,01", canvasAfterLevel2(12, calcRoomLevel2([{ id: "a", type: "level2", shape: "freeform", points: rect, level2: P(10, 20) } as RoomElement], room)).m2, 6.99);

console.log("— без радиуса —");
c = calcLevel2(rect, room, P(10, 0));
check("борт", c.bortM, 9.2);
check("верх 2,6×1,6", c.upperM2, 4.16);
check("внутри борта 2,8×1,8", c.cutM2, 5.04);

console.log("— R10 = полке → верх без скругления —");
c = calcLevel2(rect, room, P(10, 10));
check("борт", c.bortM, 9.03);
check("верх", c.upperM2, 4.16);

console.log("— без подсветки —");
c = calcLevel2(rect, room, P(10, 0, false));
check("подсветка 0", c.ledM, 0);
check("борт остаётся", c.bortM, 9.2);

console.log("— контур у стены (сторона 280 лежит на стене y=0) —");
c = calcLevel2([{ x: 60, y: 0 }, { x: 340, y: 0 }, { x: 340, y: 180 }, { x: 60, y: 180 }], room, P(10, 0));
check("борт 9,2 − 2,8", c.bortM, 6.4);
check("сторон на стене", c.sidesOnWall, 1);
check("верх: у стены полки нет → 260×170 = 4,42 (ревью №6)", c.upperM2, 4.42);
check("полка только с трёх сторон: 5,04 − 4,42", c.shelfM2, 0.62);

console.log("— контур в углу (две стороны на стенах) —");
c = calcLevel2([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }], room, P(10, 0));
check("борт 2+1,5", c.bortM, 3.5);
check("сторон на стене", c.sidesOnWall, 2);
check("верх 190×140 = 2,66", c.upperM2, 2.66);
c = calcLevel2([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 150 }, { x: 0, y: 150 }], room, P(10, 20));
check("в углу R20: скруглён только угол (200,150) → борт 3,41 (ревью №9)", c.bortM, 3.41);
check("в углу R20: низ 2,99", c.cutM2, 2.99);
check("в углу R20: радиусы у стен 0", c.contourRadii.filter((x) => x > 0).length, 1);

console.log("— ревью 08.11: контрпримеры —");
const lRoom = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 300 }, { x: 0, y: 300 }];
c = calcLevel2([{ x: 50, y: 150 }, { x: 150, y: 150 }, { x: 150, y: 250 }, { x: 50, y: 250 }], lRoom, P(10, 0));
check("№8 Г-комната: сторона на ПРОДОЛЖЕНИИ стены — не на стене, борт 4,00", c.bortM, 4);
check("№8 сторон на стене 0", c.sidesOnWall, 0);
c = calcLevel2([{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }], room, P(10, 20));
check("№10 дубль вершины: верх как у чистого 4,15", c.upperM2, 4.15);
check("№10 дубль вершины: борт 8,86", c.bortM, 8.86);
check("№10 без предупреждений", c.warnings.length, 0);
{
  const s = 22, h = s * Math.sin(Math.PI / 3);
  c = calcLevel2([{ x: 100, y: 100 }, { x: 100 + s, y: 100 }, { x: 100 + s + s / 2, y: 100 + h }, { x: 100 + s / 2, y: 100 + h }], room, P(10, 0));
  check("№3 ромб s=22, полка 10 → shelf_too_wide", c.warnings.includes("shelf_too_wide") ? 1 : 0, 1);
  c = calcLevel2([{ x: 100, y: 100 }, { x: 130, y: 100 }, { x: 100, y: 130 }], room, P(10, 0));
  check("№4 треугольник 30-30-42, полка 10 → shelf_too_wide", c.warnings.includes("shelf_too_wide") ? 1 : 0, 1);
  const S0 = 200, H0 = S0 * Math.sin(Math.PI / 3);
  c = calcLevel2([{ x: 50, y: 50 }, { x: 50 + S0, y: 50 }, { x: 50 + S0 + S0 / 2, y: 50 + H0 }, { x: 50 + S0 / 2, y: 50 + H0 }], room, P(10, 20));
  check("№2 ромб 60/120 s=200 R20: низ 3,41", c.cutM2, 3.41);
  check("№2 борт 7,41", c.bortM, 7.41);
  check("№2 верх ≈ 2,70", c.upperM2, 2.7, 0.015);
}
c = calcLevel2(room.map((p) => ({ ...p })), room, P(10, 0));
check("№6 контур = комната: борт 0", c.bortM, 0);
check("№6 верх = 12 (полки у стен нет)", c.upperM2, 12);
check("№6 низ 12", c.cutM2, 12);
c = calcLevel2([{ x: 60, y: 2 }, { x: 340, y: 2 }, { x: 340, y: 180 }, { x: 60, y: 180 }], room, P(10, 0));
check("№13 сторона в 2 см от стены (tol 3) — на стене: борт 9,16 − 2,8 = 6,36", c.bortM, 6.36);
c = calcLevel2([{ x: 50, y: 50 }, { x: 350, y: 50 }, { x: 350, y: 80 }, { x: 50, y: 80 }], room, P(10, 0));
check("№5 30×300: верх 10×280 = 0,28", c.upperM2, 0.28);
check("№5 низ 0,90", c.cutM2, 0.9);
check("№5 борт 6,60", c.bortM, 6.6);
{
  const u = [{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 240, y: 240 }, { x: 240, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 240 }, { x: 60, y: 240 }];
  c = calcLevel2(u, room, P(10, 20));
  check("№11 П-контур R20: борт 11,09", c.bortM, 11.09);
  check("№11 низ 4,03", c.cutM2, 4.03);
  // ревьюер ждал 2,85, взяв паз 100×130: но открытая сторона паза лежит на внешней стороне
  // контура и тоже сдвигается на 10 → паз 100×120; верх 41600 − 12000 − 6·21,5 = 29471 → 2,95
  check("№11 верх 2,95", c.upperM2, 2.95);
  check("№11 без предупреждений", c.warnings.length, 0);
}
{
  const ov = calcRoomLevel2([
    { id: "a", type: "level2", shape: "freeform", points: [{ x: 20, y: 20 }, { x: 250, y: 20 }, { x: 250, y: 280 }, { x: 20, y: 280 }], level2: P(10, 0) },
    { id: "b", type: "level2", shape: "freeform", points: [{ x: 150, y: 20 }, { x: 380, y: 20 }, { x: 380, y: 280 }, { x: 150, y: 280 }], level2: P(10, 0) },
  ] as RoomElement[], room)!;
  check("№12 частичное перекрытие → contours_overlap", ov.warnings.includes("contours_overlap") ? 1 : 0, 1);
  check("№12 …но не inside_other_contour", ov.warnings.includes("inside_other_contour") ? 1 : 0, 0);
}

console.log("— дуги на сегментах (bulges), как arcBulges у стен —");
c = calcLevel2([{ x: 50, y: 0 }, { x: 350, y: 0 }], room, { ...O({ lowSide: "left" }), bulges: [150] });
// хорда на восток, «+» = справа от хорды = +y, в комнату; область под дугой обходится против часовой → lowSide left
check("полукруг одним сегментом: низ ≈ π·1,5²/2 = 3,53", c.cutM2, 3.53, 0.02);
check("полукруг: борт ≈ π·1,5 = 4,71", c.bortM, 4.71, 0.02);
check("полукруг: полка ≈ 0,49", c.shelfM2, 0.49, 0.02);
check("полукруг: верх ≈ 7,98", c.upperM2, 7.98, 0.03);
check("полукруг: дуга разложена ≥ 24 точек", c.contour.length >= 25 ? 1 : 0, 1);
check("полукруг: стороны — одна, дуговая, длина ≈ 471", c.sides[0].lengthCm, 471, 2);
c = calcLevel2([{ x: 50, y: 0 }, { x: 350, y: 0 }], room, { ...O({ lowSide: "right" }), bulges: [150] });
check("тот же полукруг, низ снаружи (right): низ 12 − 3,53 = 8,47", c.cutM2, 8.47, 0.02);
check("…полка внутри дуги ≈ 0,46", c.shelfM2, 0.46, 0.02);
c = calcLevel2([{ x: 50, y: 0 }, { x: 350, y: 0 }], room, { ...O({ lowSide: "left" }), bulges: [-150] });
check("стрелка «−» — слева от хорды, за стену → outside_room", c.warnings.includes("outside_room") || c.warnings.includes("open_no_room") ? 1 : 0, 1);
// полукруг у левой стены x=0, хорда сверху вниз (0,50)→(0,250): справа от хорды = −x (за стену), значит в комнату — «−»
c = calcLevel2([{ x: 0, y: 50 }, { x: 0, y: 250 }], room, { ...O({ lowSide: "right" }), bulges: [-100] });
check("полукруг у левой стены R100 (хорда вниз, стрелка −): низ под дугой = right → π·1²/2 = 1,57", c.cutM2, 1.57, 0.02);
check("…борт π·1 = 3,14", c.bortM, 3.14, 0.02);
c = calcLevel2(rect, room, { ...P(10, 0), bulges: [20, 0, 20, 0] });
// сегмент 280 со стрелкой 20: r = 500, θ = 0,5676, площадь сегмента 3748 см², дуга 283,8
check("остров с выгнутыми длинными сторонами: низ 5,04 + 2·0,375 = 5,79", c.cutM2, 5.79, 0.02);
check("…борт 2·180 + 2·283,8 = 9,28", c.bortM, 9.28, 0.02);
check("…сумма низ+верх+полка не больше 12", c.cutM2 + c.upperM2 + c.shelfM2 <= 12.01 ? 1 : 0, 1);
check("…стороны: 4, две дуговые", c.sides.filter((s) => s.bulge).length, 2);
c = calcLevel2(rect, room, { ...P(10, 0), bulges: [-20, 0, -20, 0] });
check("вогнутые стороны: низ 5,04 − 0,75 = 4,29", c.cutM2, 4.29, 0.02);
check("вогнутые стороны R500 ≫ полки 10: полка считается", c.warnings.includes("shelf_too_wide") ? 1 : 0, 0);
c = calcLevel2([{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }], room, { ...P(10, 0), bulges: [0, 0, 0, 0] });
check("нулевые стрелки = прямые: борт 9,2", c.bortM, 9.2);
{
  // волна на одной стороне: 4 сегмента по 70 см с чередующейся стрелкой ±8
  const wave = [{ x: 60, y: 60 }, { x: 130, y: 60 }, { x: 200, y: 60 }, { x: 270, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }];
  c = calcLevel2(wave, room, { ...P(10, 0), bulges: [8, -8, 8, -8, 0, 0, 0] });
  check("волна: площадь ± симметрична → низ 5,04", c.cutM2, 5.04, 0.01);
  check("волна: борт длиннее 9,20 на 4 дуги", c.bortM > 9.2 && c.bortM < 9.4 ? 1 : 0, 1);
  check("волна: коллинеарные вершины между дугами остаются (7 сторон)", c.sides.length, 7);
}

console.log("— Г-образный контур R20 —");
const lC = [{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 240 }, { x: 60, y: 240 }];
c = calcLevel2(lC, room, P(10, 20));
// периметр 920 (280+90+140+90+140+180), 5 выпуклых углов скруглены, вогнутый — нет: 9,20 − 5·0,0857 = 8,77
check("борт", c.bortM, 8.77);
// площадь: 280·180 − 140·90 = 37800 → 3,78 − 5·0,0086 = 3,74; верх: офсет на 10 — внешние стороны
// сдвигаются внутрь (260×160), стороны выреза — от него (вырез остаётся 140×90): 41600 − 12600 = 29000
// → 2,90 − 5·0,01·0,2146 = 2,89
check("внутри борта", c.cutM2, 3.74);
check("верх", c.upperM2, 2.89);
check("вогнутый угол без предупреждений", c.warnings.length, 0);

console.log("— обход по часовой (points в другом порядке) даёт то же —");
c = calcLevel2([...rect].reverse(), room, P(10, 20));
check("борт", c.bortM, 8.86);
check("верх", c.upperM2, 4.15);

console.log("— полка шире половины стороны: 30×... контур 50×200, полка 30 —");
c = calcLevel2([{ x: 100, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 300 - 0 }, { x: 100, y: 300 }], room, P(30, 0));
check("предупреждение shelf_too_wide", c.warnings.includes("shelf_too_wide") ? 1 : 0, 1);
check("верх = внутри борта", c.upperM2, c.cutM2);

console.log("— два контура в комнате: суммы —");
const two = calcRoomLevel2([
  { id: "a", type: "level2", shape: "freeform", points: [{ x: 20, y: 20 }, { x: 180, y: 20 }, { x: 180, y: 280 }, { x: 20, y: 280 }], level2: P(10, 0) },
  { id: "b", type: "level2", shape: "freeform", points: [{ x: 220, y: 20 }, { x: 380, y: 20 }, { x: 380, y: 280 }, { x: 220, y: 280 }], level2: P(10, 0) },
] as RoomElement[], room)!;
check("контуров", two.count, 2);
check("борт 2×8,4", two.bortM, 16.8);
check("внутри 2×4,16", two.cutM2, 8.32);
check("нижнее 12 − 8,32", canvasAfterLevel2(12, two).m2, 3.68);
check("без предупреждений", two.warnings.length, 0);

console.log("— контур внутри контура и минус полотна —");
const nested = calcRoomLevel2([
  { id: "a", type: "level2", shape: "freeform", points: rect, level2: P(10, 0) },
  { id: "b", type: "level2", shape: "freeform", points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }], level2: P(10, 0) },
  { id: "c", type: "level2", shape: "freeform", points: [{ x: -50, y: -50 }, { x: 450, y: -50 }, { x: 450, y: 350 }, { x: -50, y: 350 }], level2: P(10, 0) },
] as RoomElement[], room)!;
check("inside_other_contour", nested.warnings.includes("inside_other_contour") ? 1 : 0, 1);
check("outside_room", nested.warnings.includes("outside_room") ? 1 : 0, 1);
const after = canvasAfterLevel2(12, nested);
check("полотно не в минус", after.m2, 0);
check("canvas_negative", after.warning === "canvas_negative" ? 1 : 0, 1);

console.log("— старые/битые данные —");
check("без поля level2 — дефолты: полка", level2Params({}).shelfCm, 10);
check("без поля level2 — подсветка да", level2Params({}).led ? 1 : 0, 1);
check("замыкающая точка-дубль не ломает периметр", calcLevel2([...rect, rect[0]].slice(0), room, P(10, 0)).bortM, 9.2);
check("повёрнутый контур (rotation 90) считается", (() => {
  const l = calcRoomLevel2([{ id: "r", type: "level2", shape: "freeform", rotation: 90, points: rect, level2: P(10, 0) } as RoomElement], room)!;
  return l.cutM2;
})(), 5.04);
check("2 точки — не контур", calcRoomLevel2([{ id: "x", type: "level2", shape: "freeform", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] } as RoomElement], room) === null ? 1 : 0, 1);
check("другой тип игнорируется", calcRoomLevel2([{ id: "x", type: "lightline", shape: "freeform", points: rect } as RoomElement], room) === null ? 1 : 0, 1);

// ───────── открытая линия борта (Нариман 08.11 19:32: «пополам», полукруг над кроватью) ─────────

console.log("— линия «пополам»: x=200 от стены до стены, lowSide left (слева по ходу вниз = восток, x>200) —");
c = calcLevel2([{ x: 200, y: 0 }, { x: 200, y: 300 }], room, O({ lowSide: "left" }));
check("низ 6 м²", c.cutM2, 6);
check("полка 0,3 м² (3 м × 10 см)", c.shelfM2, 0.3);
check("верх 5,7 м²", c.upperM2, 5.7);
check("борт 3 м (концы на стенах не считаются)", c.bortM, 3);
check("подсветка 3 м", c.ledM, 3);
check("низ — область x>200: центр x≈300", c.lowPolygon.reduce((s, p) => s + p.x, 0) / c.lowPolygon.length, 300, 1);
check("предупреждений нет", c.warnings.length, 0);
c = calcLevel2([{ x: 200, y: 0 }, { x: 200, y: 300 }], room, O({ lowSide: "right" }));
check("lowSide right: низ 6", c.cutM2, 6);
check("lowSide right: верх 5,7", c.upperM2, 5.7);
check("lowSide right: низ — область x<200", c.lowPolygon.reduce((s, p) => s + p.x, 0) / c.lowPolygon.length, 100, 1);
c = calcLevel2([{ x: 200, y: 300 }, { x: 200, y: 0 }], room, O({ lowSide: "left" }));
check("обратное направление, left → низ x<200", c.lowPolygon.reduce((s, p) => s + p.x, 0) / c.lowPolygon.length, 100, 1);
c = calcLevel2([{ x: 200, y: 30 }, { x: 200, y: 300 }], room, O({ lowSide: "left" }));
check("конец в 30 см от стены → ends_not_on_wall", c.warnings.includes("ends_not_on_wall") ? 1 : 0, 1);
check("…и притянут: низ 6", c.cutM2, 6);
c = calcLevel2([{ x: 200, y: 0 }, { x: 200, y: 300 }], room, O({ lowSide: "left", led: false }));
check("без подсветки: 0", c.ledM, 0);
c = calcLevel2([{ x: 200, y: 0 }, { x: 200, y: 300 }], null, O({ lowSide: "left" }));
check("без комнаты — open_no_room", c.warnings.includes("open_no_room") ? 1 : 0, 1);

console.log("— ломаная «пополам» с углом: (200,0)→(200,150)→(400,150), lowSide left (прямоугольник 2×1,5 справа-сверху), R20 —");
c = calcLevel2([{ x: 200, y: 0 }, { x: 200, y: 150 }, { x: 400, y: 150 }], room, O({ lowSide: "left", radiusCm: 20 }));
// низ 3,0 − 0,2146·0,04 = 2,99 (выпуклый угол низа срезан); борт 3,5 − 0,429·0,2 = 3,41
check("низ 2,99", c.cutM2, 2.99);
check("борт 3,41", c.bortM, 3.41);
check("сумма низ+верх+полка = 12", c.cutM2 + c.upperM2 + c.shelfM2, 12, 0.02);
check("полка ≈ 3,5·0,1 + угол 0,01 = 0,36", c.shelfM2, 0.36, 0.02);
check("верх ≈ 8,65", c.upperM2, 8.65, 0.03);
c = calcLevel2([{ x: 200, y: 0 }, { x: 200, y: 150 }, { x: 400, y: 150 }], room, O({ lowSide: "right", radiusCm: 20 }));
check("lowSide right: низ 9 + 0,0086 (вогнутый угол низа получает) = 9,01", c.cutM2, 9.01);
check("lowSide right: сумма 12", c.cutM2 + c.upperM2 + c.shelfM2, 12, 0.02);

console.log("— полукруг R150 у стены y=0 (центр (200,0), 40 сегментов), низ — под полукругом —");
const K = 40;
const arc = Array.from({ length: K + 1 }, (_, i) => { const a = Math.PI - (Math.PI * i) / K; return { x: 200 + 150 * Math.cos(a), y: 150 * Math.sin(a) }; });
c = calcLevel2(arc, room, O({ lowSide: "left" }));
// аналитически: низ π·1,5²/2 = 3,534 (вписанный 40-угольник 3,531); борт π·1,5 = 4,712 (хорды 4,711);
// полка π/2·(1,6² − 1,5²) = 0,487; верх 12 − 3,534 − 0,487 = 7,98
check("низ ≈ 3,53", c.cutM2, 3.53, 0.015);
check("борт ≈ 4,71", c.bortM, 4.71, 0.015);
check("полка ≈ 0,49", c.shelfM2, 0.49, 0.015);
check("верх ≈ 7,98", c.upperM2, 7.98, 0.03);
check("сумма 12", c.cutM2 + c.upperM2 + c.shelfM2, 12, 0.02);
check("предупреждений нет", c.warnings.length, 0);
c = calcLevel2(arc, room, O({ lowSide: "right" }));
check("полукруг, низ снаружи: низ ≈ 8,47", c.cutM2, 8.47, 0.015);
check("полукруг, низ снаружи: полка внутри дуги ≈ π/2·(1,5²−1,4²) = 0,46", c.shelfM2, 0.46, 0.015);
check("сумма 12", c.cutM2 + c.upperM2 + c.shelfM2, 12, 0.02);
const dense = Array.from({ length: 61 }, (_, i) => { const a = Math.PI - (Math.PI * i) / 60; return { x: 200 + 150 * Math.cos(a), y: 150 * Math.sin(a) }; });
c = calcLevel2(dense, room, O({ lowSide: "left", radiusCm: 20 }));
check("60 точек + R20: низ ≈ 3,53 (скругление 3° углов ничтожно)", c.cutM2, 3.53, 0.02);
check("60 точек: борт ≈ 4,71", c.bortM, 4.71, 0.02);

console.log("— в комнате и остров, и линия —");
const mix = calcRoomLevel2([
  { id: "a", type: "level2", shape: "freeform", points: [{ x: 20, y: 20 }, { x: 180, y: 20 }, { x: 180, y: 280 }, { x: 20, y: 280 }], level2: P(10, 0) },
  { id: "b", type: "level2", shape: "freeform", points: [{ x: 300, y: 0 }, { x: 300, y: 300 }], level2: O({ lowSide: "left" }) },
] as RoomElement[], room)!;
check("контуров 2", mix.count, 2);
check("низ 4,16 + 3 = 7,16", mix.cutM2, 7.16);
check("борт 8,4 + 3 = 11,4", mix.bortM, 11.4);
// QA Б6 (11.11.2026): из полотна вычитается верх + полка (у линии — её ВЕРХНЯЯ сторона 9 м²), а не низ.
// Остров внутри верхней стороны линии — сочетание без однозначной площади: честное предупреждение,
// а не прежние «12 − 7,16 = 4,84» (там из полотна вычитался низ линии — та же ошибка, что Б6).
check("остров + линия: полотно 0 (вычитается верх линии 9 + остров 4,16 > 12)", canvasAfterLevel2(12, mix).m2, 0);
check("остров + линия: предупреждение canvas_negative", canvasAfterLevel2(12, mix).warning === "canvas_negative" ? 1 : 0, 1, 0);
check("без предупреждений", mix.warnings.length, 0);
check("level2Params: closed по умолчанию", level2Params({}).closed ? 1 : 0, 1);
check("level2Params: lowSide по умолчанию left", level2Params({}).lowSide === "left" ? 1 : 0, 1);

// ── ревью 09.11.2026: волна (4 дуги ±8 на верхней стороне) не ломает R20 соседних углов и стык полки ──
{
  const room = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const pts = [{ x: 60, y: 60 }, { x: 130, y: 60 }, { x: 200, y: 60 }, { x: 270, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }];
  const c = calcLevel2(pts, room, { ...LEVEL2_DEFAULTS, radiusCm: 20, bulges: [8, -8, 8, -8, 0, 0, 0] });
  const flat = calcLevel2([pts[0], pts[4], pts[5], pts[6]], room, { ...LEVEL2_DEFAULTS, radiusCm: 20 });
  const cornerR = c.contour.map((p, i) => (c.contourCorners[i] && [60, 340].includes(p.x) && [60, 240].includes(p.y) ? c.contourRadii[i] : -1)).filter((v) => v >= 0);
  check("волна: углов с R20", cornerR.filter((r) => Math.abs(r - 20) < 1e-6).length, 4, 0);
  const up = c.upper ?? [];
  check("волна: точек полки за линией x=330", up.filter((p) => p.x > 330 + 1e-6).length, 0, 0);
  check("волна: точек полки за линией x=70", up.filter((p) => p.x < 70 - 1e-6).length, 0, 0);
  check("волна: низ ≈ без волны, м²", c.cutM2, flat.cutM2, 0.03);
  check("волна: предупреждений", c.warnings.length, 0, 0);
}
// ── ревью 09.11.2026 (2): касательная окружность у дуги (эталон — растровая истина / ручной расчёт),
//    путь у плотных точек без возвратов, обрезка сдвига у острого угла двух дуг (#91) ──
{
  const R4 = [{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }];
  const cases: [string, number[], number, number, number][] = [
    ["долина −40", [-40, 0, 0, 0], 4.216, 3.381, 8.663],
    ["долина −80", [-80, 0, 0, 0], 3.332, 2.52, 8.39],
    ["долина −100", [-100, 0, 0, 0], 2.839, 2.06, 8.12],
    ["шип −40/−40", [-40, -40, 0, 0], 3.661, 2.91, 8.07],
    ["дуга +40", [40, 0, 0, 0], 5.778, 4.896, 9.189],
  ];
  for (const [nm, b, cut, up, bort] of cases) {
    const c = calcLevel2(R4, null, { ...LEVEL2_DEFAULTS, radiusCm: 20, bulges: b });
    check(`${nm} R20: низ, м²`, c.cutM2, cut, 0.015);
    check(`${nm} R20: верх, м²`, c.upperM2, up, 0.02);
    check(`${nm} R20: борт, м (растр ±0,08)`, c.bortM, bort, 0.08);
  }
  const pp = [{ x: 0, y: 0 }, { x: 94, y: 0 }, { x: 97, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 3 }, { x: 100, y: 6 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const dp = level2Path(pp, pp.map((_, i) => (i === 3 ? 20 : 0)), true);
  check("путь у плотных точек: возвратов «L 94 → L 80»", dp.includes("L 97.0 0.0 L 80.0") || dp.includes("L 94.0 0.0 L 97.0") ? 1 : 0, 0, 0);
  const p91 = [[257, 187.4], [225.1, 272.9], [137.4, 156], [133, 66.2], [231.5, 92.5]].map(([x, y]) => ({ x, y }));
  const d91 = densify({ points: p91, bulges: [11, -65, 11, 0, 0], closed: true }, "left");
  const U91 = clipOffsetOvershoot(d91.pts, offsetEdgesInward(d91.pts, d91.pts.map(() => 10)), d91.isCorner);
  check("#91: точек сдвига за контуром", U91.filter((p) => p.x <= 100 || p.x >= 300 || p.y <= 40 || p.y >= 290).length, 0, 0);
}
// ── ревью 10.11.2026 (3): петля кромки, дуга у стены, перекрытие скруглений, R без ступеней ──
{
  const ct = calcLevel2([{ x: 60, y: 60 }, { x: 200, y: 60 }, { x: 200, y: 72 }, { x: 60, y: 200 }], null, { ...LEVEL2_DEFAULTS, radiusCm: 0 });
  check("трапеция скос 12: верх, м² (истина 0,630)", ct.upperM2, 0.63, 0.01);
  check("трапеция скос 12: shelf_too_wide", ct.warnings.includes("shelf_too_wide") ? 1 : 0, 0, 0);
  const room300 = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const wa = calcLevel2([{ x: 100, y: 120 }, { x: 300, y: 120 }, { x: 300, y: 200 }, { x: 100, y: 200 }], room300, { ...LEVEL2_DEFAULTS, radiusCm: 0, bulges: [0, 0, 100, 0] });
  check("дуга касается стены: верх, м² (как без комнаты 2,53)", wa.upperM2, 2.53, 0.01);
  const c50 = calcLevel2([{ x: 264.5, y: 153.8 }, { x: 150.6, y: 203.4 }, { x: 226.3, y: 35.2 }], null, { ...LEVEL2_DEFAULTS, radiusCm: 50 });
  check("треугольник R50: петель скруглённого контура", selfIntersects(filletPolygon(c50.contour, c50.contourRadii, true), true) ? 1 : 0, 0, 0);
  const sq = calcLevel2([{ x: 100, y: 100 }, { x: 160, y: 100 }, { x: 160, y: 160 }, { x: 100, y: 160 }], null, { ...LEVEL2_DEFAULTS, radiusCm: 50, led: false });
  check("квадрат 60 R50: радиус", Math.min(...sq.contourRadii), 30, 0.05);
  const st = calcLevel2([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 130 }, { x: 100, y: 130 }], null, { ...LEVEL2_DEFAULTS, radiusCm: 20, led: false });
  check("полоса 30×200 R20: радиус", Math.min(...st.contourRadii), 15, 0.05);
}
// ── ревью 11.11.2026 (4): непомещающийся угол не отнимает радиус у дальних углов ──
{
  const room4 = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const cut = calcLevel2([{ x: 60, y: 60 }, { x: 330, y: 60 }, { x: 340, y: 70 }, { x: 340, y: 240 }, { x: 60, y: 240 }], room4, { ...LEVEL2_DEFAULTS, radiusCm: 20 });
  const rc = cut.contour.map((p, i) => (cut.contourCorners[i] ? cut.contourRadii[i] : -1)).filter((v) => v >= 0);
  check("срез 10×10 R20: R угла (60,60)", rc[0], 20, 0.01);
  check("срез 10×10 R20: R угла (340,240)", rc[3], 20, 0.01);
  const wv = calcLevel2([{ x: 60, y: 60 }, { x: 130, y: 60 }, { x: 200, y: 60 }, { x: 270, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 240 }, { x: 60, y: 240 }], room4, { ...LEVEL2_DEFAULTS, radiusCm: 50, bulges: [10, -10, 10, -10, 0, 0, 0] });
  const rw = wv.contour.map((p, i) => (wv.contourCorners[i] && p.y === 240 ? wv.contourRadii[i] : 99)).filter((v) => v < 99);
  check("волна ±10 R50: мин. R нижних прямых углов", Math.min(...rw), 50, 0.01);
}
// ── QA Б6 (11.11.2026): полотно + полотно 2-го уровня + полка = комната, для всех форм ──
{
  const R = (w: number, h: number) => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const cases: [string, { x: number; y: number }[], { x: number; y: number }[], Record<string, unknown>][] = [
    ["остров", R(400, 300), [{ x: 80, y: 60 }, { x: 320, y: 60 }, { x: 320, y: 240 }, { x: 80, y: 240 }], { radiusCm: 20 }],
    ["в углу", R(400, 300), [{ x: 0, y: 0 }, { x: 280, y: 0 }, { x: 280, y: 180 }, { x: 0, y: 180 }], { radiusCm: 20 }],
    ["линия низ слева", R(400, 300), [{ x: 130, y: 0 }, { x: 130, y: 300 }], { closed: false, lowSide: "left" }],
    ["линия низ справа", R(400, 300), [{ x: 130, y: 0 }, { x: 130, y: 300 }], { closed: false, lowSide: "right" }],
    ["полукруг QA", R(500, 400), [{ x: 190, y: 0 }, { x: 310, y: 0 }], { closed: false, lowSide: "left", bulges: [50] }],
    ["полукруг низ снаружи", R(500, 400), [{ x: 190, y: 0 }, { x: 310, y: 0 }], { closed: false, lowSide: "right", bulges: [50] }],
  ];
  for (const [nm, roomPts, pts, extra] of cases) {
    const roomM2 = (roomPts[1].x * roomPts[2].y) / 10000;
    const lvl = calcRoomLevel2([{ type: "level2", points: pts, level2: { ...LEVEL2_DEFAULTS, ...extra } } as unknown as RoomElement], roomPts)!;
    const c = lvl.items[0].calc;
    check(`Б6 ${nm}: полотно + верх + полка, м²`, canvasAfterLevel2(roomM2, lvl).m2 + c.upperM2 + c.shelfM2, roomM2, 0.015);
  }
}
// ── QA Б8 (11.11.2026): остров 60×50 с полкой 100 — сдвиг не выворачивается наружу ──
{
  const room4 = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const c = calcLevel2([{ x: 170, y: 125 }, { x: 230, y: 125 }, { x: 230, y: 175 }, { x: 170, y: 175 }], room4, { ...LEVEL2_DEFAULTS, radiusCm: 0, shelfCm: 100 });
  check("Б8: 60×50 полка 100 → shelf_too_wide", c.warnings.includes("shelf_too_wide") ? 1 : 0, 1, 0);
  check("Б8: кромки нет (верх = низ)", c.upper ? 1 : 0, 0, 0);
}
// ── QA Б7 (11.11.2026): острый треугольник R50 — уменьшается только острая вершина, монотонно ──
{
  const tri = [{ x: 60, y: 90 }, { x: 404, y: 110 }, { x: 70, y: 184 }];
  const c50 = calcLevel2(tri, null, { ...LEVEL2_DEFAULTS, radiusCm: 50 }), c30 = calcLevel2(tri, null, { ...LEVEL2_DEFAULTS, radiusCm: 30 });
  check("Б7: R острой вершины при R50", c50.contourRadii[1], 23.8, 0.2);
  check("Б7: R острой вершины при R30 (монотонно)", c30.contourRadii[1], 23.8, 0.2);
}
console.log(fails === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\nПРОВАЛОВ: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
