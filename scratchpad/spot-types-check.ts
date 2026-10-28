/**
 * Проверка типов софитов на сайте (28.10.2026): builder + calculate без базы.
 *   npx tsx scratchpad/spot-types-check.ts
 */
import { buildRoomInputFromDesigner } from "../src/lib/room-input-builder";
import { calculate } from "../src/lib/calculate";
import { DEFAULT_PRICES } from "../src/lib/constants";

const base = { walls: [400, 300, 400, 300], normalCorners: [true, true, true, true], area: 12, perimeter: 14, name: "Тест" };
const el = (i: number, extra: Record<string, unknown> = {}) => ({ type: "spot", x: 50 + i * 30, y: 50, ...extra });

function lines(elements: Array<Record<string, unknown>>, existing?: Record<string, unknown>) {
  const room = buildRoomInputFromDesigner({ id: "r1", ...base, elements: elements as never }, existing as never);
  const own = { v1: { code: "own:v1", name: "Даунлайт", unit: "шт.", price: 7000, photoUrl: null } };
  const calc = calculate([room], DEFAULT_PRICES, {}, undefined, own);
  const spots = calc.roomResults[0].items.filter((it) => /spot|own:/.test(it.itemCode));
  return { room: { spotsCount: room.spotsCount, spotType: room.spotType, spotsByType: room.spotsByType }, spots, total: calc.roomResults[0].subtotal };
}

let fails = 0;
const check = (name: string, ok: boolean, info: unknown) => { console.log(ok ? "✅" : "❌", name, JSON.stringify(info)); if (!ok) fails++; };

// 1. Старый замер: 5 софитов без типа → одна строка spot_ours × 5 (сумма как раньше).
const old = lines([el(0), el(1), el(2), el(3), el(4)]);
check("старые без типа = 1 строка GX53×5", old.spots.length === 1 && old.spots[0].itemCode === "spot_ours" && old.spots[0].quantity === 5, old);

// 2. Смесь: 4 Даунлайт (вариант) + 3 GX53 (тип) + 2 без типа → GX53×5 и Даунлайт×4.
const mix = lines([el(0, { priceVariantId: "v1" }), el(1, { priceVariantId: "v1" }), el(2, { priceVariantId: "v1" }), el(3, { priceVariantId: "v1" }),
  el(4, { spotType: "spot_ours" }), el(5, { spotType: "spot_ours" }), el(6, { spotType: "spot_ours" }), el(7), el(8)]);
const gx = mix.spots.find((s) => s.itemCode === "spot_ours"); const dl = mix.spots.find((s) => s.itemCode === "own:v1");
check("смесь: GX53×5 + Даунлайт×4 по 7000", !!gx && gx.quantity === 5 && !!dl && dl.quantity === 4 && dl.unitPrice === 7000 && dl.installCode === "install_spot" && mix.spots.length === 2, mix);

// 3. BH53 + BH10 + клиентские.
const bh = lines([el(0, { spotType: "spot_bh53" }), el(1, { spotType: "spot_bh53" }), el(2, { spotType: "spot_bh10" }), el(3, { variant: "client" })]);
check("BH53×2, BH10×1, клиентские×1", bh.spots.length === 3 && bh.spots.some((s) => s.itemCode === "spot_bh53" && s.quantity === 2 && s.unitPrice === 7000)
  && bh.spots.some((s) => s.itemCode === "spot_bh10" && s.quantity === 1) && bh.spots.some((s) => s.itemCode === "spot_client" && s.quantity === 1), bh);

// 4. Удалённый вариант → GX53.
const gone = lines([el(0, { priceVariantId: "nope" }), el(1, { priceVariantId: "nope" })]);
check("удалённый вариант считается как GX53", gone.spots.length === 1 && gone.spots[0].itemCode === "spot_ours" && gone.spots[0].quantity === 2, gone);

// 5. Мастер в КП выбрал spot_client для старой строки, рядом типизированные GX53 — не сливаем.
const cl = lines([el(0), el(1, { spotType: "spot_ours" })], { spotType: "spot_client" });
check("existing spot_client не глотает типизированные GX53", cl.spots.some((s) => s.itemCode === "spot_client" && s.quantity === 1) && cl.spots.some((s) => s.itemCode === "spot_ours" && s.quantity === 1), cl);

console.log(fails ? `\n${fails} провал(ов)` : "\nвсё сошлось");
process.exit(fails ? 1 : 0);
