// Shared room/element types — extracted from vision-test/room-designer.tsx
// чтобы их могли импортить и серверные роуты, и публичные страницы (без тяги
// 3000-строчного клиентского RoomDesigner в bundle).

export type ElementType =
  | "spot"
  | "pendant"
  | "chandelier"
  /** Вытяжка (вентиляционный выход) — точечный элемент Ø 10–12 см, как софит (23.10.2026). */
  | "vent"
  | "curtain"
  | "subcurtain"
  | "track"
  | "lightline"
  /** Двухуровневый потолок: замкнутый контур борта, рисуется как световая линия (08.11.2026). */
  | "level2"
  | "floating"
  | "door"
  | "window"
  | "furniture"
  | "builtin_gardina"
  | "shower_curtain";

export type FurnitureType =
  | "bed"
  | "sofa"
  | "table"
  | "wardrobe"
  | "tv"
  | "nightstand"
  | "chair"
  | "desk"
  | "radiator"
  | "kitchen"
  | "wall_panel";

export type CeilingMode = "decor" | "to-ceiling" | "planned";

/**
 * Параметры элемента «2 уровня» (08.11.2026). Нарисованный контур (points) — линия
 * БОРТА: вертикальный переход между уровнями. Внутрь от борта идёт полка шириной
 * shelfCm (на ней подсветка), дальше — верхнее полотно; от стен до борта — нижний
 * уровень. Все размеры в см. Нет поля на элементе → дефолты (см. level2-geometry.ts).
 */
export interface Level2Params {
  /** Ширина полки, см (10). */
  shelfCm: number;
  /** Перепад уровней, см (10). */
  dropCm: number;
  /** Подсветка в ступеньке (LED по кромке борта светит на верхнее полотно). По умолчанию да. */
  led: boolean;
  /** Скругление углов борта, см: чипы 0 / 10 / 20 / 30 / 50 или своё число ≥ 0 (режется до половины короткой стороны). */
  radiusCm: number;
  /**
   * Стрелки дуг по сегментам борта, см (как arcBulges у стен): сегмент i = points[i]→points[i+1],
   * у замкнутого контура n штук, у открытой линии n−1. У острова «+» — дуга выгнута наружу
   * (к нижнему уровню), «−» — внутрь; у открытой линии «+» — справа по ходу хорды (y вниз),
   * «−» — слева. Нет поля / 0 — прямые. Полукруг у стены = один сегмент со стрелкой R;
   * волна = чередование знаков.
   */
  bulges?: number[];
  /**
   * Форма борта (Нариман 08.11.2026, фото мастеров): true/нет поля — «остров», замкнутый
   * контур, верх внутри; false — открытая линия от стены до стены (прямая «пополам»,
   * полукруг над кроватью), концы на стенах. В приложении v1 — только остров.
   */
  closed?: boolean;
  /**
   * Открытая линия: с какой стороны нижний уровень — слева или справа по ходу самой линии,
   * если смотреть на чертёж (y вниз): «left» — область, которую борт с участком стен
   * обходит против часовой на экране. Полка и подсветка — с другой (верхней) стороны.
   * По умолчанию left. (У полукруга область под дугой — «left».)
   */
  lowSide?: "left" | "right";
  /**
   * Зарезервировано для 3D: где верх — внутри контура (up, по умолчанию) или снаружи.
   * В v1 не показывается и не меняется.
   */
  direction?: "up" | "down";
}

export interface RoomElement {
  id: string;
  type: ElementType;
  x?: number;
  y?: number;
  wallIndex?: number;
  wallPosition?: number;
  length?: number;
  variant?: "ours" | "client";
  furnitureType?: FurnitureType;
  width?: number;
  height?: number;
  rotation?: number;
  shape?: "straight" | "u-niche" | "l-bend" | "freeform";
  depth?: number;
  side?: "left" | "right";
  points?: { x: number; y: number }[];
  closed?: boolean;
  /** Только у type="level2": полка, перепад, подсветка, радиус. */
  level2?: Level2Params;
  ceilingMode?: CeilingMode;
  furnitureId?: string;
  edgeIndex?: number;
  furnitureShape?: "rect" | "custom";
  polygonPoints?: { x: number; y: number }[];
  /** ID группы (для софитов в паре/тройке) — при drag двигаются вместe. */
  groupId?: string;
  /** Гардина (curtain / builtin_gardina): цвет профиля для 3D и чертежа. Пусто — чёрная (09.11.2026). */
  color?: "black" | "white";
  /** Гардина: число рядов (1 — однорядная для ванной, 2 — обычная, 3 — тройная). Пишет приложение. */
  rows?: 1 | 2 | 3;
  /** Гардина с подсветкой (приложение, 10.11.2026). */
  withLight?: boolean;
  /** Трек: код стандартного типа (track_magnetic — магнитный, track_surface — накладной). */
  trackType?: string;
  /**
   * Привязка к конкретному товару из прайса мастера (PriceVariant.id).
   * Если задано — в 3D рендерится модель с реальными размерами/цветом,
   * AI-промпт включает spec и опционально фото товара как reference.
   */
  priceVariantId?: string;
  /** Софит: код стандартного типа из каталога (spot_ours = GX53, spot_bh53, spot_bh10).
   *  Свой софит — через priceVariantId. Пусто — без типа, как раньше (28.10.2026, см. lib/spot-types.ts). */
  spotType?: string;
  /**
   * @deprecated Legacy-поля для подшторника «через выступы». Текущая
   * single-anchor модель хранит сторону через `wallIndex` (anchor) +
   * `wallPosition` (может выходить за [0..1]) + `length` (может превышать
   * длину anchor-стены). Сохраняем поля только для backward-compat: при
   * загрузке комнаты с DB старые подшторники мигрируются в canonical форму
   * автоматически (см. normalizeStraightSubcurtain в room-designer.tsx).
   */
  spanFromVertex?: number;
  /** @deprecated см. spanFromVertex */
  spanToVertex?: number;
  /** Дверь: разворот (петли × сторона открывания). Пусто — петли у начала стены, внутрь.
   *  Пишет мобилка с 08.11.2026 (см. DoorSwing). */
  swing?: DoorSwing;
}

/**
 * Разворот двери на чертеже (мобилка, koshak_pp 02.11.2026): "start"/"end" —
 * петли у вершины wallIndex / wallIndex+1 (по направлению обхода стены),
 * "in"/"out" — открывается внутрь комнаты / наружу. Пусто = "start-in".
 */
export type DoorSwing = "start-in" | "end-in" | "end-out" | "start-out";

export interface Vertex2D {
  x: number;
  y: number;
}
