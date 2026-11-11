#!/bin/zsh
# Файлы-близнецы 3D (сайт ↔ приложение) — сверка побайтно, по образцу canvas-pricing.
#   twins.sh [путь к potolok-integration] [ревизия приложения, по умолчанию main] → 0 если все совпали.
# Список пар — scratchpad/parity/twins.manifest (его же читает sync-from-app.sh).
# Правила: nohdr — без строки «ФАЙЛ-БЛИЗНЕЦ» (шапки ссылаются друг на друга);
#          fiber-web — у приложения "@react-three/fiber/native", на сайте "@react-three/fiber".
SITE=$(cd "$(dirname "$0")/../.." && pwd)
APP=${1:-$HOME/projects/potolok-integration}
REV=${2:-main}
MAN="$SITE/scratchpad/parity/twins.manifest"
rc=0
appcat() { git -C "$APP" show "$REV:$1" 2>/dev/null; }
while read -r site app rule; do
  [[ -z "$site" || "$site" == \#* ]] && continue
  case "$rule" in
    nohdr) ok=$(cmp -s <(grep -v "ФАЙЛ-БЛИЗНЕЦ" "$SITE/$site") <(appcat "$app" | grep -v "ФАЙЛ-БЛИЗНЕЦ") && echo 1 || echo 0) ;;
    fiber-web) ok=$(cmp -s "$SITE/$site" <(appcat "$app" | sed 's#@react-three/fiber/native#@react-three/fiber#') && echo 1 || echo 0) ;;
    optional)
      if ! git -C "$APP" cat-file -e "$REV:$app" 2>/dev/null; then echo "· $site — нет в $REV (optional)"; continue; fi
      ok=$(cmp -s "$SITE/$site" <(appcat "$app") && echo 1 || echo 0) ;;
    *) ok=$(cmp -s "$SITE/$site" <(appcat "$app") && echo 1 || echo 0) ;;
  esac
  if [[ "$ok" == 1 ]]; then echo "= $site${rule:+ ($rule)}"; else echo "≠ $site  ↔  $app"; rc=1; fi
done < "$MAN"
# Платформенные шимы (не близнецы): textures.ts, room-3d/lightBalance.ts (→ src/lib/shared),
# src/lib/shared/room-types.ts, rn-globals.d.ts; src/lib/level2-geometry.ts — переадресация.
exit $rc
