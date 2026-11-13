// Число софитов для обложки КП (13.11.2026).
// Раньше брали ПЕРВУЮ строку комнаты со словом «софит/спот/светильник/led»:
// после листа «Софит» в одной комнате бывает несколько строк (GX53, BH53, BH10,
// свои, клиентские, двойные) — на обложке выходило «2 софитов» при 10 в КП.
// Теперь — сумма по всем строкам софитов всех комнат; пара = 2, тройка = 3.
//
// Коды строк софитов: веб (calculate.ts) — spot_ours/spot_bh53/spot_bh10/
// spot_client/spot_pair_ours/spot_pair_client/spot_triple; приложение — ещё
// "spot", "spot:t:…", "spot:v:…", "spot_pair". Свои софиты веба приходят с
// кодом "own:…" — для них и строк без кода смотрим на название.

type SpotLine = { itemCode?: string; name: string; quantity: number; unit: string };

/** Коды, по которым тип строки не понять: решаем по названию. */
function isOpaqueCode(code: string): boolean {
  return code.startsWith("own:") || code === "custom" || code === "extra" || code.startsWith("quick_");
}

const NOT_A_SPOT_RE = /закладн|вытяжк|укрывоч|обвод|кольц|стакан|трансформ|платформ|подвесн|плафон|блок питан/;

/** Сколько светильников в одной единице строки; 0 — строка не софит. */
export function spotsPerUnit(line: SpotLine): number {
  const code = (line.itemCode ?? "").trim().toLowerCase();
  const name = line.name.toLowerCase();
  const unit = line.unit.toLowerCase();
  if (code && !isOpaqueCode(code)) {
    if (!code.startsWith("spot")) return 0; // трансформатор, люстра, pendant…
    if (code.includes("platform")) return 0; // закладная под софит — не светильник
    // В приложении "spot" и "spot:v:<id>" — вся категория прайса «Софиты» мастера:
    // там лежат вытяжки, закладные, стаканчики, плафоны… — их отсекаем по названию
    // (проверка по 804 КП, 13.11.2026). Остальные spot-коды решает код.
    if ((code === "spot" || code.startsWith("spot:v:")) && NOT_A_SPOT_RE.test(name)) return 0;
    if (code.startsWith("spot_triple")) return 3;
    if (code.startsWith("spot_pair") || unit.startsWith("пар")) return 2;
    return 1;
  }
  // Запасной путь — по названию (старые КП, свои позиции)
  if (!/софит|спот/.test(name)) return 0;
  if (NOT_A_SPOT_RE.test(name)) return 0;
  if (/тройн/.test(name)) return 3;
  if (/двойн/.test(name) || unit.startsWith("пар")) return 2;
  return 1;
}

export function countSpots(estimate: { rooms: { items: SpotLine[] }[] }): number {
  let n = 0;
  for (const r of estimate.rooms) {
    for (const it of r.items) {
      const k = spotsPerUnit(it);
      if (k > 0 && it.quantity > 0) n += it.quantity * k;
    }
  }
  return Math.round(n);
}

export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

/** Подпись под числом: «софит / софита / софитов» (с заглавной — для тем с капсом). */
export function spotsLabel(n: number, capital = false): string {
  const w = pluralRu(n, ["софит", "софита", "софитов"]);
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}

/** Подпись под числом комнат: «помещение / помещения / помещений». */
export function roomsLabel(n: number, capital = false): string {
  const w = pluralRu(n, ["помещение", "помещения", "помещений"]);
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}
