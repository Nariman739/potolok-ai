/**
 * Роли позиций прайса — чистый модуль без Prisma (его импортируют и миграция,
 * и price-items.ts, и в будущем общий расчёт).
 *
 * role — единственный ответ на вопрос «как это посчитать и где показать»:
 *   canvas  — по площади комнаты (м²)
 *   wall    — по длине стен, на которых выбран (м.п.); wallKind уточняет
 *   point   — по элементам чертежа из appliesTo (софит, люстра, бра) (шт.)
 *   linear  — по погонным элементам из appliesTo (трек, линия, гардина)
 *   corner  — лишние углы (авто)
 *   extra   — количество вводит мастер (диффузор, демонтаж, радиус…)
 *   param   — мин. заказ, коэффициент высоты
 *   install — цены монтажнику
 */

export type PriceRole = "canvas" | "wall" | "point" | "linear" | "corner" | "extra" | "param" | "install";

export type WallKind = {
  /** стена идёт со вставкой (пластик/алюминий со вставкой) */
  withInsert?: boolean;
  /** углы в комнате алюминиевые (теневой/парящий/алюминий) */
  aluminumCorners?: boolean;
  /** за ним профиля нет — подшторник, ЛДСП, евробрус */
  endsCeiling?: boolean;
  /** добавка к другой стене (вставка, LED-лента), сама по себе не выбирается */
  companion?: boolean;
  /** флаг старого PriceVariant.noInsert — хранится как есть для точного round-trip */
  noInsert?: boolean;
};

export type RoleMeta = { role: PriceRole; appliesTo?: string[]; wallKind?: WallKind };

/** Роль каждой каталожной позиции. Код, которого здесь нет, считается extra (install_* — install). */
export const TEMPLATE_ROLES: Record<string, RoleMeta> = {
  canvas_320: { role: "canvas" },
  canvas_550: { role: "canvas" },
  canvas_over: { role: "canvas" },

  profile_plastic: { role: "wall", appliesTo: ["pvc_insert", "pvc"], wallKind: { withInsert: true } },
  insert: { role: "wall", appliesTo: ["pvc_insert", "aluminum_insert"], wallKind: { companion: true } },
  profile_shadow: { role: "wall", appliesTo: ["shadow"], wallKind: { aluminumCorners: true } },
  profile_floating: { role: "wall", appliesTo: ["floating"], wallKind: { aluminumCorners: true } },
  profile_aluminum: { role: "wall", appliesTo: ["aluminum_insert", "aluminum"], wallKind: { withInsert: true, aluminumCorners: true } },
  led_strip: { role: "wall", appliesTo: ["subcurtain_light"], wallKind: { companion: true } },

  spot_client: { role: "point", appliesTo: ["spot"] },
  spot_ours: { role: "point", appliesTo: ["spot"] },
  spot_pair_client: { role: "point", appliesTo: ["spot_pair"] },
  spot_pair_ours: { role: "point", appliesTo: ["spot_pair"] },
  pendant: { role: "point", appliesTo: ["pendant"] },
  pendant_install: { role: "point", appliesTo: ["pendant"] },
  chandelier: { role: "point", appliesTo: ["chandelier"] },
  chandelier_install: { role: "point", appliesTo: ["chandelier"] },
  transformer: { role: "point", appliesTo: ["chandelier"] },

  track_magnetic: { role: "linear", appliesTo: ["track"] },
  light_line: { role: "linear", appliesTo: ["lightline"] },
  curtain_ldsp: { role: "linear", appliesTo: ["curtain"] },
  curtain_aluminum: { role: "linear", appliesTo: ["curtain"] },
  gardina_plastic: { role: "linear", appliesTo: ["gardina"] },
  gardina_aluminum: { role: "linear", appliesTo: ["gardina"] },
  pk14: { role: "linear", appliesTo: ["gardina"] },

  podshtornik_plastic: { role: "wall", appliesTo: ["subcurtain", "subcurtain_light"], wallKind: { endsCeiling: true } },
  podshtornik_ldsp: { role: "wall", appliesTo: ["ldsp"], wallKind: { endsCeiling: true } },
  podshtornik_aluminum: { role: "wall", appliesTo: ["subcurtain", "subcurtain_light"], wallKind: { endsCeiling: true } },
  eurobrus: { role: "wall", appliesTo: ["eurobrus"], wallKind: { endsCeiling: true } },

  corner_plastic: { role: "corner" },
  corner_aluminum: { role: "corner" },
  corner_rounded: { role: "corner" },
  corner_furniture_bypass: { role: "corner" },
  corner_furniture_planned: { role: "corner" },

  pipe_bypass: { role: "extra" },
  diffuser: { role: "extra" },
  vent_grille: { role: "extra" },
  demontage: { role: "extra" },

  min_order: { role: "param" },
  height_coefficient: { role: "param" },
};

export function templateRole(code: string): RoleMeta {
  if (TEMPLATE_ROLES[code]) return TEMPLATE_ROLES[code];
  if (code.startsWith("install_")) return { role: "install" };
  return { role: "extra" };
}

/** Категория старого PriceVariant → роль своей позиции. */
export const CATEGORY_ROLES: Record<string, RoleMeta> = {
  canvas: { role: "canvas" },
  profile: { role: "wall" },
  podshtornik: { role: "wall", wallKind: { endsCeiling: true } },
  spot: { role: "point", appliesTo: ["spot"] },
  spot_pair: { role: "point", appliesTo: ["spot_pair"] },
  chandelier: { role: "point", appliesTo: ["chandelier"] },
  track: { role: "linear", appliesTo: ["track"] },
  lightline: { role: "linear", appliesTo: ["lightline"] },
  curtain: { role: "linear", appliesTo: ["curtain"] },
  gardina: { role: "linear", appliesTo: ["gardina"] },
  corner: { role: "corner" },
  other: { role: "extra" },
  custom: { role: "extra" },
};

/** Категории, которые принимает «Добавить вариант». Теперь открыты все, включая «Прочее». */
export const VARIANT_CATEGORIES = Object.keys(CATEGORY_ROLES).filter((c) => c !== "custom");

/**
 * Имена, за которыми стоит штучная допработа, в какую бы категорию их ни положили.
 * Это случай Жандоса: «Дифузор» в «Люстрах», потому что «Прочее» было закрыто.
 * Та же регулярка (в синтаксисе Postgres) живёт в миграции 20261001_price_items.
 */
export const EXTRA_NAME_RE = /(диф+уз|деф+уз|вентил|вытяжк|пожар|трубопров|демонтаж|блок питания|лайт ?бокс|радиус)/i;

/**
 * Роль своей позиции по категории и имени; needsReview — если роль выведена не из категории.
 * Категорию при этом НЕ меняем: старое приложение ищет выбранный вариант внутри
 * его категории (`variantsByCategory[cat].find(id)`), и «Дифузор» из «Люстр»,
 * переехав в «Прочее», тихо слетел бы на дефолт в комнатах Жандоса (ревью 01.10.2026).
 */
export function inferRole(category: string, name: string, noInsert = false): RoleMeta & { needsReview: boolean; category: string } {
  if (EXTRA_NAME_RE.test(name)) {
    return { role: "extra", needsReview: category !== "other" && category !== "custom", category };
  }
  const base = CATEGORY_ROLES[category] ?? CATEGORY_ROLES.other;
  const meta: RoleMeta = { ...base, wallKind: base.wallKind ? { ...base.wallKind } : undefined };
  if (meta.role === "wall") {
    meta.wallKind = { ...(meta.wallKind ?? {}), noInsert, withInsert: category === "profile" ? !noInsert : false };
  }
  return { ...meta, needsReview: false, category };
}
