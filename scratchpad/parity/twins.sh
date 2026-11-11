#!/bin/zsh
# Файлы-близнецы 3D (сайт ↔ приложение) — сверка побайтно, по образцу canvas-pricing.
# twins.sh [путь к potolok-integration]  → 0 если все совпали.
SITE=$(cd "$(dirname "$0")/../.." && pwd)
APP=${1:-$HOME/projects/potolok-integration}
rc=0
check() { if cmp -s "$SITE/$1" "$APP/$2"; then echo "= $1"; else echo "≠ $1  ↔  $2"; rc=1; fi; }
# данные (сайт src/lib ↔ приложение src/lib/shared)
check src/lib/wall-furniture.ts      src/lib/shared/wall-furniture.ts
check src/lib/furniture-ceiling.ts   src/lib/shared/furniture-ceiling.ts
check src/lib/spot-types.ts          src/lib/shared/spot-types.ts
check src/lib/canvas-pricing.ts      src/lib/shared/canvas-pricing.ts
# 3D (сайт src/lib/shared ↔ приложение src/components/room-3d)
check src/lib/shared/lightBalance.ts src/components/room-3d/lightBalance.ts
exit $rc
