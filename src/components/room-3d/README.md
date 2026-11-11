# 3D на сайте — файлы-близнецы приложения

С 11.11.2026 3D сайта (`/z/<id>`, `/kp/<id>/3d`, дашборд, `/render-scene`) рисует ту же
комнату, что приложение (`potolok-integration/src/components/room-3d/`). Большинство файлов
здесь — **близнецы приложения побайтно**: `Room3D.tsx`, `WallElement3D.tsx`, `WallFacade3D.tsx`,
`Level2Ceiling3D.tsx`, `level2Geometry3D.ts`, `level2Look.ts`, `floatingLight.ts`, `lightTextures.ts`,
`windowLight.ts`, `ceilingBake.ts`, `wallBake.ts`, `furnitureModels.ts`, `Furniture3D.tsx`,
`furnitureBuilder.ts`, `furniturePalette.ts`, `furnitureOrientation.ts`, `floorLook.ts`, `trimLook.ts`,
`chandelierLook.ts`, `realism2.ts`, `fixtureKinds.ts`, `sceneInvalidate.ts`, `Spot3D.tsx`,
`Gx53Spot3D.tsx`, `FramelessSpot3D.tsx`; `Chandelier3D.tsx` — почти близнец (импорт
`@react-three/fiber` без `/native`). Полный список пар — `scratchpad/parity/twins.manifest`.

**Правило: близнецов править только в приложении, потом синхронизировать:**

```bash
scratchpad/parity/sync-from-app.sh ~/projects/potolok-integration main   # копия + twins.sh + tsc
scratchpad/parity/twins.sh ~/projects/potolok-integration main           # только сверка
```

Своё, не близнецы (здесь правим): `Scene3D.tsx` (обёртка под веб — свет, камера, HUD мастера,
AI-захват, слои масок для «Фото клиенту»), `textures.ts` (веб-загрузка тех же картинок из
`public/textures/app/`, API как в приложении), `constants.ts` (значения приложения + `promptDesc`
для AI-промпта), `types.ts` (типы чертежа сайта + `interiorSign`), `lightBalance.ts` (переадресация
на близнеца `src/lib/shared/lightBalance.ts`), `rn-globals.d.ts` (`__DEV__`), `AiSceneCapture.tsx`,
`LookAroundControls.tsx`, `ScreenshotCapture.tsx`, `Scene3DBoundary.tsx`, `R3FErrorBoundary.tsx`.

**Тон показа клиенту (12.11.2026):** `designPassLook.ts` и `SpotHalos.tsx` — близнецы. Проп
`showTone` у `Scene3D` включает тон «▶ Показать клиенту» приложения (экспозиция 0.8, градиент
полотна в запечке, софиты светятся, плотнее тени угла и мебели). Решение Наримана: у клиента
(`/z`, `/kp/3d` — через `Public3DViewer`) тон ВСЕГДА; дашборд мастера и `/render-scene` — обычный
вид (проп не передают). Значения тона меняются только в `designPassLook.ts` приложения + sync.

Правила вида (Нариман): матовое полотно, без времени суток и виньетки, подпись «3D · в разработке»
не снимать. Тюль/шторы в 3D — не добавлять. Данные: сцена получает те же поля, что `RoomSnapshot` приложения (`src/lib/room-3d.ts`).
