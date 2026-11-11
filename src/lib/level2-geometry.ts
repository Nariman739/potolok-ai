// «2 уровня» — геометрия и расчёт (08.11.2026). С 11.11.2026 сам код живёт в
// src/lib/shared/level2-geometry.ts — файле-близнеце приложения (potolok-integration/
// src/lib/shared/level2-geometry.ts, побайтно, проверка scratchpad/parity/twins.sh):
// его читают и расчёт КП / чертёж наряда / PDF (через этот модуль), и 3D (level2Geometry3D).
// Здесь — только переадресация, чтобы импорты КП не менялись.
export * from "./shared/level2-geometry";
