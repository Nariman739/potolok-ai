// Shared room/element types — extracted from vision-test/room-designer.tsx
// чтобы их могли импортить и серверные роуты, и публичные страницы (без тяги
// 3000-строчного клиентского RoomDesigner в bundle).

export type ElementType =
  | "spot"
  | "pendant"
  | "chandelier"
  | "curtain"
  | "subcurtain"
  | "track"
  | "lightline"
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
  ceilingMode?: CeilingMode;
  furnitureId?: string;
  edgeIndex?: number;
  furnitureShape?: "rect" | "custom";
  polygonPoints?: { x: number; y: number }[];
  /** ID группы (для софитов в паре/тройке) — при drag двигаются вместe. */
  groupId?: string;
  /**
   * Привязка к конкретному товару из прайса мастера (PriceVariant.id).
   * Если задано — в 3D рендерится модель с реальными размерами/цветом,
   * AI-промпт включает spec и опционально фото товара как reference.
   */
  priceVariantId?: string;
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
}

export interface Vertex2D {
  x: number;
  y: number;
}
