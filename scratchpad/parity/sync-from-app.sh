#!/bin/zsh
# Односторонняя синхронизация файлов-близнецов 3D: приложение → сайт (11.11.2026).
#   sync-from-app.sh [путь к potolok-integration] [ревизия приложения, по умолчанию main]
# Берёт список пар из twins.manifest, копирует каждый файл из git-ревизии приложения
# (не из рабочего дерева — чтобы не утащить чужие незакоммиченные правки), применяет правило
# (nohdr — не трогаем, это только для сверки; fiber-web — импорт fiber без /native),
# затем прогоняет twins.sh и tsc. Правила: править близнецов ТОЛЬКО в приложении, потом sync.
set -e
SITE=$(cd "$(dirname "$0")/../.." && pwd)
APP=${1:-$HOME/projects/potolok-integration}
REV=${2:-main}
MAN="$SITE/scratchpad/parity/twins.manifest"
n=0
while read -r site app rule; do
  [[ -z "$site" || "$site" == \#* ]] && continue
  case "$rule" in
    nohdr) echo "· $site — расчётный близнец, не копируем (шапка «ФАЙЛ-БЛИЗНЕЦ» своя)"; continue ;;
    fiber-web) git -C "$APP" show "$REV:$app" | sed 's#@react-three/fiber/native#@react-three/fiber#' > "$SITE/$site" ;;
    *) git -C "$APP" show "$REV:$app" > "$SITE/$site" ;;
  esac
  n=$((n + 1))
  echo "→ $site"
done < "$MAN"
echo "скопировано: $n файлов из $REV"
echo "--- twins.sh:"
"$SITE/scratchpad/parity/twins.sh" "$APP" "$REV" | grep -v "^= " || true
echo "--- tsc:"
(cd "$SITE" && npx tsc --noEmit -p tsconfig.json && echo "tsc: 0 ошибок")
