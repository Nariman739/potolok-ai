// Перерисовка 3D-сцены по требованию (09.10.2026).
//
// Canvas работает в frameloop="demand": кадр рисуется только после
// invalidate() — жест камеры, загрузка текстуры/GLB, смена пресета (r3f сам
// зовёт invalidate при смене пропсов). Статичная сцена не жжёт батарею и GPU.
//
// Тени статичны: shadow map пересчитывается только по запросу
// requestShadowRebake() — при монтировании сцены и когда догрузилась мебель.
// Раньше тени пеклись ровно 4 первых кадра: если мебель/материалы не успевали
// к этим кадрам (а это гонка), тени не было вовсе — на эмуляторе тень шкафа
// то была, то нет между перезапусками.

let invalidateFn: (() => void) | null = null;
let rebakeFrames = 0;
// Запрос кадра до того, как ShadowBaker зарегистрировал invalidate (эффекты
// соседей — SceneEnvironment, текстуры — могут сработать раньше): запоминаем
// и отдаём при регистрации. Иначе первый вид мог остаться без IBL/текстур до
// первого касания (плавающая гонка на старте, 04.11.2026).
let pendingInvalidate = false;

export function setSceneInvalidate(fn: (() => void) | null): void {
  invalidateFn = fn;
  if (fn && pendingInvalidate) {
    pendingInvalidate = false;
    fn();
  }
}

/** Попросить новый кадр (для изменений вне React-пропсов: камера, загрузки). */
export function invalidateScene(): void {
  if (invalidateFn) invalidateFn();
  else pendingInvalidate = true;
}

/** Перепечь тени за ближайшие n кадров (кадры будут запрошены сами). */
export function requestShadowRebake(frames = 3): void {
  rebakeFrames = Math.max(rebakeFrames, frames);
  invalidateScene();
}

/** Для ShadowBaker: нужно ли печь тень в этом кадре (и уменьшает счётчик). */
export function consumeShadowRebake(): { bake: boolean; more: boolean } {
  if (rebakeFrames <= 0) return { bake: false, more: false };
  rebakeFrames -= 1;
  return { bake: true, more: rebakeFrames > 0 };
}

// Задержка «жест → кадр» для диагностики (diag.slow / maxDtMs). В demand-режиме
// интервал между кадрами = простой между касаниями, его считать нельзя —
// меряем, сколько прошло от первого необработанного жеста до кадра.
let inputPendingSince = 0;

export function markInputPending(): void {
  if (inputPendingSince === 0) inputPendingSince = Date.now();
}

/** Мс от первого жеста до этого кадра (0 — кадр не от жеста). Сбрасывает отметку. */
export function takeInputLatencyMs(): number {
  if (inputPendingSince === 0) return 0;
  const ms = Date.now() - inputPendingSince;
  inputPendingSince = 0;
  return ms;
}
