import type { RoomInput } from "@/lib/types";

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Сравнение размеров с точностью формы (1 см). */
function sameDims(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return near(a, b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameDims(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameDims((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b || (a == null && b == null);
}

const shapeOf = (s?: string) => (!s || s === "square" ? "rectangle" : s);

function sameGeometry(a: RoomInput, b: RoomInput): boolean {
  return shapeOf(a.shape) === shapeOf(b.shape)
    && near(a.length, b.length) && near(a.width, b.width)
    && sameDims(a.lShapeDims, b.lShapeDims)
    && sameDims(a.tShapeDims, b.tShapeDims)
    && sameDims(a.customDims, b.customDims);
}

/**
 * Правка комнаты в форме калькулятора. Форма показывает не всё, что знает чертёж:
 * треки, линии, пары софитов, однорядную гардину, выбор вариантов. Эти поля
 * переносим как есть. Площадь и периметр с чертежа верны, только пока размеры те же.
 */
export function mergeEditedRoom(edit: RoomInput, form: RoomInput): RoomInput {
  const merged: RoomInput = {
    ...edit,
    ...form,
    trackMagneticLength: edit.trackMagneticLength,
    lightLineLength: edit.lightLineLength,
    eurobrusCount: edit.eurobrusCount,
  };
  if (!sameGeometry(edit, form)) {
    merged.measuredArea = undefined;
    merged.measuredPerimeter = undefined;
    merged.measuredMinWidth = undefined;
    merged.designerData = undefined;
  }
  // Участок подшторника у стены описывает старую длину. Разбивка софитов по типам
  // не зависит от spotsCount: там только софиты без типа.
  if (form.podshtornikLength !== edit.podshtornikLength) merged.podshtornikOnWallLength = undefined;
  return merged;
}
