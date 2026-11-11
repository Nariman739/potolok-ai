#!/bin/zsh
# Файлы-близнецы 3D (сайт ↔ приложение) — сверка побайтно, по образцу canvas-pricing.
# twins.sh [путь к potolok-integration] [ревизия приложения, по умолчанию main] → 0 если все совпали.
# Для файлов с шапкой «ФАЙЛ-БЛИЗНЕЦ: …» (ссылаются друг на друга) сравнение без этой строки.
SITE=$(cd "$(dirname "$0")/../.." && pwd)
APP=${1:-$HOME/projects/potolok-integration}
REV=${2:-main}
rc=0
appcat() { git -C "$APP" show "$REV:$1" 2>/dev/null; }
check() {
  if cmp -s "$SITE/$1" <(appcat "$2"); then echo "= $1"; else echo "≠ $1  ↔  $2"; rc=1; fi
}
check_nohdr() {
  if cmp -s <(grep -v "ФАЙЛ-БЛИЗНЕЦ" "$SITE/$1") <(appcat "$2" | grep -v "ФАЙЛ-БЛИЗНЕЦ"); then echo "= $1 (без шапки)"; else echo "≠ $1  ↔  $2"; rc=1; fi
}
# данные (сайт src/lib ↔ приложение src/lib/shared)
check_nohdr src/lib/canvas-pricing.ts      src/lib/shared/canvas-pricing.ts
check src/lib/wall-furniture.ts            src/lib/shared/wall-furniture.ts
check src/lib/furniture-ceiling.ts         src/lib/shared/furniture-ceiling.ts
check src/lib/spot-types.ts                src/lib/shared/spot-types.ts
check src/lib/shared/level2-geometry.ts    src/lib/shared/level2-geometry.ts
# 3D (сайт src/lib/shared ↔ приложение src/components/room-3d)
check src/lib/shared/lightBalance.ts       src/components/room-3d/lightBalance.ts
# 3D-модули без RN-импортов (сайт src/components/room-3d ↔ приложение src/components/room-3d)
for f in level2Geometry3D.ts Level2Ceiling3D.tsx level2Look.ts floatingLight.ts lightTextures.ts windowLight.ts \
         furnitureModels.ts Furniture3D.tsx furnitureBuilder.ts furniturePalette.ts furnitureOrientation.ts floorLook.ts sceneInvalidate.ts; do
  check src/components/room-3d/$f src/components/room-3d/$f
done
exit $rc
