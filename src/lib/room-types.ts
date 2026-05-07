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
  /** Подшторник «через выступы»: индексы вершин полигона, между которыми
   *  идёт прямая. Если заданы — длина и рендер считаются по этой прямой,
   *  а съеденные углы (между from и to) вычитаются из периметра/углов. */
  spanFromVertex?: number;
  spanToVertex?: number;
}

export interface Vertex2D {
  x: number;
  y: number;
}
