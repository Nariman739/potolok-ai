/**
 * Профиль по стенам: один код для сайта и приложения.
 * ФАЙЛ-БЛИЗНЕЦ: potolok-ai-app/src/lib/shared/wall-profile-pricing.ts — держать идентичным.
 *
 * Перенесено из calcRoom приложения (app/estimate.tsx, 10.11.2026) без изменения логики:
 * багет по стенам (пластик, алюминий, теневой, бесщелевой, парящий, подшторник, ЛДСП,
 * евробрус, свои позиции из прайса), вставка, парящий профиль и выбор алюминиевых углов.
 * Чистая функция: цены и скрытие позиций приходят снаружи.
 */

export type WallProfileKind =
  | "pvc"
  | "aluminum"
  | "shadow"
  | "gapless"
  | "floating"
  | "subcurtain"
  | "subcurtain_light"
  | "ldsp"
  | "eurobrus";

/** Своя позиция прайса на стене (категории «профиль» и «подшторник») или выбранная на комнату. */
export interface WallProfileVariant {
  id: string;
  name: string;
  unit?: string | null;
  price: number;
  installerPrice?: number | null;
  photoUrl?: string | null;
  /** На этот багет ставится вставка. */
  withInsert?: boolean;
  /** Профиль комнаты без вставки (старая галочка на сайте). */
  noInsert?: boolean;
}

/** Элементы чертежа, которые занимают стену: подшторник и парящий (legacy). */
export interface WallProfileElement {
  type: string;
  wallIndex?: number;
  length?: number;
  shape?: string;
  depth?: number;
}

export interface WallProfileInput {
  /** Длины стен, см. */
  walls: number[];
  /** Тип багета или id своей позиции по индексу стены. */
  wallProfiles?: Record<number, string> | Record<string, string> | null;
  elements: WallProfileElement[];
  /** Периметр профиля с обходом мебели до потолка, м. */
  adjustedPerimeterM: number;
  /** Обход мебели до потолка, м: добавляется к парящему, если он есть. */
  bypassPerimeterM: number;
  /** Свои позиции прайса категорий «профиль» и «подшторник». */
  wallVariants: WallProfileVariant[];
  /** Профиль, выбранный на комнату: заменяет пластиковый. */
  profileOverride?: WallProfileVariant;
  /** Вставка в комнате (решение комнаты или объекта). */
  insert: boolean;
  insertColor?: "white" | "black";
  price: (code: string) => number;
  /** Ставка монтажнику по коду позиции. */
  installerRate: (code: string) => number;
  /** Ставка позиции без своей строки «Для бригады»: 0, если мастер не задал. */
  workOnly: (code: string) => number;
  isHidden: (code: string) => boolean;
}

export interface WallProfileLine {
  name: string;
  unit: string;
  qty: number;
  price: number;
  total: number;
  code?: string;
  variantId?: string;
  photoUrl?: string;
  category?: "profile";
  installName: string;
  installPrice: number;
}

export interface WallProfileResult {
  lines: WallProfileLine[];
  /** Хоть одна стена теневая, бесщелевая, парящая или алюминиевая (или legacy парящий). */
  aluminumCorners: boolean;
  /** Парящий профиль, м (уже в lines). */
  floatingM: number;
}

/** Количество в КП — до 0,1, как r2 в приложении. */
function r2(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Legacy: galtel/no_insert/pvc_insert → pvc, aluminum_insert → aluminum. */
export function normalizeWallProfile(p: string | undefined): string {
  if (p === undefined || p === "" || p === "galtel" || p === "no_insert" || p === "pvc_insert") return "pvc";
  if (p === "aluminum_insert") return "aluminum";
  return p;
}

/**
 * Старые замеры (до 30.10.2026) хранили «со вставкой / без» в типе стены.
 * Решение комнаты по этим меткам или null, если меток нет. Как legacyInsertFlag приложения.
 */
export function legacyInsertFlag(
  wallProfiles: Record<number, string> | Record<string, string> | null | undefined,
  wallsCount?: number,
): boolean | null {
  if (!wallProfiles) return null;
  let sawInsert = false, sawNoInsert = false;
  for (const v of Object.values(wallProfiles)) {
    if (v === "pvc_insert" || v === "galtel" || v === "aluminum_insert") sawInsert = true;
    else if (v === "pvc" || v === "no_insert") sawNoInsert = true;
  }
  if (sawInsert) return true;
  if (!sawNoInsert) return null;
  if (wallsCount) {
    for (let i = 0; i < wallsCount; i++) if ((wallProfiles as Record<number, string>)[i] === undefined) return true;
  }
  return false;
}

/** Длина подшторника с нишей, см: П-ниша = ширина + 2×глубина, Г-ниша = ширина + глубина. */
function subcurtainCm(e: WallProfileElement): number {
  const len = e.length || 0;
  if (e.shape === "u-niche" && e.depth) return len + 2 * e.depth;
  if (e.shape === "l-bend" && e.depth) return len + e.depth;
  return len;
}

export function wallProfilePricing(input: WallProfileInput): WallProfileResult {
  const { walls, elements: els, price: p, installerRate: pi, workOnly, isHidden } = input;
  const wallProfiles = (input.wallProfiles ?? undefined) as Record<number, string> | undefined;
  const lines: WallProfileLine[] = [];
  const push = (l: Omit<WallProfileLine, "total">) => lines.push({ ...l, total: l.qty * l.price });

  // Подшторник заканчивает потолок — за ним нет профиля.
  const subM = els.filter((e) => e.type === "subcurtain").reduce((s, e) => s + subcurtainCm(e), 0) / 100;

  // Длина подшторника по стенам (см) — отнимается из своей стены.
  const subLenByWall: Record<number, number> = {};
  for (const e of els) {
    if (e.type !== "subcurtain" || e.wallIndex === undefined) continue;
    subLenByWall[e.wallIndex] = (subLenByWall[e.wallIndex] ?? 0) + subcurtainCm(e);
  }
  // Подшторник без стены: сопоставляем по длине, иначе профиль задвоится с подшторником.
  for (const e of els) {
    if (e.type !== "subcurtain" || e.wallIndex !== undefined) continue;
    const len = e.length || 0;
    if (len <= 0) continue;
    let bestIdx = -1, bestDiff = Infinity;
    for (let i = 0; i < walls.length; i++) {
      if (subLenByWall[i]) continue;
      const diff = Math.abs((walls[i] || 0) - len);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDiff <= 30) subLenByWall[bestIdx] = (subLenByWall[bestIdx] ?? 0) + len;
  }
  // Парящие элементы (legacy) по стенам.
  const floatingElByWall: Record<number, number> = {};
  for (const e of els) {
    if (e.type !== "floating" || e.wallIndex === undefined) continue;
    floatingElByWall[e.wallIndex] = (floatingElByWall[e.wallIndex] ?? 0) + (e.length || 0);
  }

  let pvcCm = 0, aluminumCm = 0, shadowCm = 0, gaplessCm = 0, floatingFromWallCm = 0;
  let subcurtainProfCm = 0, subcurtainLightCm = 0, ldspCm = 0, eurobrusCm = 0;
  // Свои позиции на стенах: одна строка на позицию, метры по стенам суммируются.
  let customCm = 0, customInsertCm = 0;
  const customByVariant = new Map<string, { variant: WallProfileVariant; cm: number }>();
  for (let i = 0; i < walls.length; i++) {
    const availForProfile = Math.max(0, (walls[i] || 0) - (subLenByWall[i] ?? 0) - (floatingElByWall[i] ?? 0));
    const rawType = wallProfiles?.[i];
    const profType = normalizeWallProfile(rawType);
    const customVariant = rawType ? input.wallVariants.find((v) => v.id === rawType) : undefined;
    if (customVariant) {
      customCm += availForProfile;
      if (customVariant.withInsert === true) customInsertCm += availForProfile;
      const acc = customByVariant.get(customVariant.id);
      if (acc) acc.cm += availForProfile;
      else customByVariant.set(customVariant.id, { variant: customVariant, cm: availForProfile });
    } else if (profType === "floating") floatingFromWallCm += availForProfile;
    else if (profType === "shadow") shadowCm += availForProfile;
    else if (profType === "gapless") gaplessCm += availForProfile;
    else if (profType === "aluminum") aluminumCm += availForProfile;
    else if (profType === "subcurtain") subcurtainProfCm += availForProfile;
    else if (profType === "subcurtain_light") subcurtainLightCm += availForProfile;
    else if (profType === "ldsp") ldspCm += availForProfile;
    else if (profType === "eurobrus") eurobrusCm += availForProfile;
    else pvcCm += availForProfile; // default и неизвестный тип — пластик
  }
  for (const { variant, cm } of customByVariant.values()) {
    const qty = r2(cm / 100);
    if (qty <= 0) continue;
    push({
      name: variant.name, unit: variant.unit || "м.п.", qty, price: variant.price, variantId: variant.id,
      photoUrl: variant.photoUrl || undefined,
      installName: `Монтаж: ${variant.name}`, installPrice: variant.installerPrice != null ? variant.installerPrice : pi("install_profile"),
    });
  }
  const pvcM = r2(pvcCm / 100);
  const aluminumM = r2(aluminumCm / 100);
  const shadowM = r2(shadowCm / 100);
  const gaplessM = r2(gaplessCm / 100);
  const subcurtainProfM = r2(subcurtainProfCm / 100);
  const subcurtainLightM = r2(subcurtainLightCm / 100);
  const ldspM = r2(ldspCm / 100);
  const eurobrusM = r2(eurobrusCm / 100);
  // Парящий: стены + legacy элементы + обход мебели (если парящий вообще есть).
  const legacyFloatingCm = Object.values(floatingElByWall).reduce((s, v) => s + v, 0);
  const totalFloatingBaseCm = floatingFromWallCm + legacyFloatingCm;
  const floatingM = totalFloatingBaseCm > 0 ? r2(totalFloatingBaseCm / 100 + input.bypassPerimeterM) : 0;

  // Сумма по стенам приводится к ожидаемой длине профиля, разница — в пластик (в обе стороны, не в минус).
  const allWallsM = r2((pvcCm + aluminumCm + shadowCm + gaplessCm + floatingFromWallCm + subcurtainProfCm + subcurtainLightCm + ldspCm + eurobrusCm + customCm) / 100);
  const expectedM = r2(input.adjustedPerimeterM - subM - r2(legacyFloatingCm / 100));
  const pvcMFinal = r2(Math.max(0, pvcM + (expectedM - allWallsM)));

  const profileOverride = input.profileOverride;
  if (pvcMFinal > 0) {
    push({
      name: profileOverride?.name || "Профиль пластиковый", unit: "м.п.", qty: pvcMFinal,
      price: profileOverride?.price ?? p("profile_plastic"), category: "profile",
      variantId: profileOverride?.id, photoUrl: profileOverride?.photoUrl || undefined,
      code: profileOverride ? undefined : "profile_plastic",
      installName: "Монтаж профиля", installPrice: profileOverride?.installerPrice != null ? profileOverride.installerPrice : pi("install_profile"),
    });
  }
  if (aluminumM > 0) {
    push({ name: "Алюминиевый профиль", unit: "м.п.", qty: aluminumM, price: p("profile_aluminum"), code: "profile_aluminum", installName: "Монтаж алюминиевого профиля", installPrice: pi("install_profile") });
  }
  // Вставка: на пластик, алюминий, евробрус и свои багеты с галочкой «вставка».
  const pvcInsertM = profileOverride?.noInsert === true ? 0 : pvcMFinal;
  const insertM = input.insert ? r2(pvcInsertM + aluminumM + eurobrusM + r2(customInsertCm / 100)) : 0;
  if (insertM > 0 && !isHidden("insert")) {
    push({ name: input.insertColor === "black" ? "Вставка (чёрная)" : "Вставка", unit: "м.п.", qty: insertM, price: p("insert"), code: "insert", installName: "Монтаж вставки", installPrice: workOnly("insert") });
  }
  if (shadowM > 0) {
    push({ name: "Теневой профиль", unit: "м.п.", qty: shadowM, price: p("profile_shadow"), code: "profile_shadow", installName: "Монтаж теневого профиля", installPrice: pi("install_profile") });
  }
  if (gaplessM > 0) {
    push({ name: "Бесщелевой профиль", unit: "м.п.", qty: gaplessM, price: p("profile_gapless"), code: "profile_gapless", installName: "Монтаж бесщелевого профиля", installPrice: pi("install_profile") });
  }
  // Подшторник по стенам: обычный и с подсветкой — одна строка, LED отдельно.
  const totalSubcurtainM = r2(subcurtainProfM + subcurtainLightM);
  if (totalSubcurtainM > 0) {
    push({ name: "Подшторник пластиковый", unit: "м.п.", qty: totalSubcurtainM, price: p("podshtornik_plastic"), code: "podshtornik_plastic", installName: "Монтаж подшторника", installPrice: pi("install_profile") });
  }
  if (subcurtainLightM > 0) {
    push({ name: "LED-подсветка для подшторника", unit: "м.п.", qty: subcurtainLightM, price: p("led_strip"), code: "led_strip", installName: "Монтаж LED-подсветки", installPrice: workOnly("led_strip") });
  }
  if (ldspM > 0) {
    push({ name: "ЛДСП по периметру", unit: "м.п.", qty: ldspM, price: p("podshtornik_ldsp"), code: "podshtornik_ldsp", installName: "Монтаж ЛДСП", installPrice: pi("install_profile") });
  }
  if (eurobrusM > 0) {
    push({ name: "Евро брус", unit: "м.п.", qty: eurobrusM, price: p("eurobrus"), code: "eurobrus", installName: "Монтаж евро бруса", installPrice: pi("install_profile") });
  }
  if (floatingM > 0) {
    push({ name: "Парящий профиль", unit: "м.п.", qty: floatingM, price: p("profile_floating"), code: "profile_floating", installName: "Монтаж парящего профиля", installPrice: pi("install_profile") });
  }

  const aluminumWall = Object.values(wallProfiles ?? {}).map(normalizeWallProfile).some(
    (t) => t === "shadow" || t === "gapless" || t === "floating" || t === "aluminum",
  );
  return { lines, aluminumCorners: aluminumWall || legacyFloatingCm > 0, floatingM };
}
