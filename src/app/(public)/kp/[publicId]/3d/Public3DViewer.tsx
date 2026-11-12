"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Scene3DBoundary } from "@/components/room-3d/Scene3DBoundary";
import type { RoomElement, Vertex2D } from "@/lib/room-types";
import type { WallFurnitureEntry } from "@/lib/wall-furniture";

const Scene3D = dynamic(
  () => import("@/components/room-3d/Scene3D").then((m) => m.Scene3D),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-[#e4e6e8]">
        <div className="text-sm text-gray-500 animate-pulse">Загружаю 3D-сцену…</div>
      </div>
    ),
  },
);

interface Props {
  brandColor: string;
  vertices: Vertex2D[];
  walls: number[];
  ceilingHeight: number;
  elements: RoomElement[];
  /** Профили стен, вставка, фасад шкафа — как в снапшоте 3D приложения (паритет, 11.11.2026). */
  wallProfiles?: Record<number, string>;
  withInsert?: boolean;
  insertColor?: "black" | "white";
  wallFurniture?: WallFurnitureEntry[];
  /** Подпись «3D · в разработке» на языке мастера. */
  betaLabel?: string;
  fallbackImageUrl?: string | null;
  /** Ссылка «назад» (напр. к КП). null → кнопку не показываем. */
  backHref?: string | null;
  backLabel?: string;
  /** Тексты экрана «3D не открылось» (нет WebGL) на языке мастера; button — к КП (если backHref). */
  noGl?: { title: string; text: string; button?: string; retry: string };
}

/** Есть ли WebGL у устройства. Без него Canvas r3f пишет ошибку в консоль и оставляет серое поле. */
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    // Только WebGL2: three 0.184 без WebGL1 не работает — на «только webgl» устройстве экран сразу, без 10 с серого.
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext(); // контекст-пробу сразу отдаём — их число ограничено
    return true;
  } catch {
    return false;
  }
}

/** Экран вместо 3D, когда WebGL нет (12.11.2026): превью, простые слова, кнопка к расчёту. */
function NoGlFallback({ imageUrl, texts, href, brandColor, onRetry }: { imageUrl?: string | null; texts: NonNullable<Props["noGl"]>; href: string | null; brandColor: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 bg-[#e4e6e8]" data-testid="no-webgl">
      <div className="max-w-sm w-full text-center">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full rounded-2xl shadow-lg mb-4 object-cover" />
        )}
        <div className="text-base font-bold text-gray-800 mb-1.5">{texts.title}</div>
        <div className="text-sm text-gray-600 mb-4">{texts.text}</div>
        <div className="flex flex-col items-center gap-2.5">
          {href && texts.button && (
            <Link href={href} prefetch={false} className="inline-flex items-center justify-center px-5 h-11 rounded-xl text-white text-sm font-semibold shadow-lg active:scale-95" style={{ backgroundColor: brandColor }}>
              {texts.button}
            </Link>
          )}
          <button type="button" onClick={onRetry} className="px-4 h-10 rounded-xl text-sm font-semibold text-gray-700 bg-white/80 shadow active:scale-95">
            {texts.retry}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Public3DViewer({
  brandColor,
  vertices,
  walls,
  ceilingHeight,
  elements,
  wallProfiles,
  withInsert,
  insertColor,
  wallFurniture,
  betaLabel,
  fallbackImageUrl,
  backHref = null,
  backLabel = "Назад",
  noGl,
}: Props) {
  // null — ещё не проверили (до гидратации): показываем ту же заглушку, что и загрузчик сцены.
  const [glOk, setGlOk] = useState<boolean | null>(null);
  useEffect(() => {
    // null — первая проба или «Попробовать ещё раз»: проба снова, Scene3D монтируется заново.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- проверка возможна только в браузере
    if (glOk === null) setGlOk(hasWebGL());
  }, [glOk]);

  if (glOk === false && noGl) {
    return (
      <div className="fixed inset-0 bg-[#e4e6e8]">
        <NoGlFallback imageUrl={fallbackImageUrl} texts={noGl} href={backHref} brandColor={brandColor} onRetry={() => setGlOk(null)} />
        {betaLabel && (
          <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/35 text-white/90 text-[10px] font-medium pointer-events-none select-none">
            {betaLabel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#e4e6e8]">
      {glOk === null ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#e4e6e8]">
          <div className="text-sm text-gray-500 animate-pulse">Загружаю 3D-сцену…</div>
        </div>
      ) : (
      <Scene3DBoundary fallbackImageUrl={fallbackImageUrl}>
        <Scene3D
          vertices={vertices}
          walls={walls}
          ceilingHeight={ceilingHeight}
          elements={elements}
          wallProfiles={wallProfiles}
          withInsert={withInsert}
          insertColor={insertColor}
          wallFurniture={wallFurniture}
          betaLabel={betaLabel}
          readOnly
          // Клиент всегда видит 3D тоном «Показать клиенту» (решение Наримана 12.11).
          showTone
          // Контекст не создался / потерян и не вернулся — тот же экран «не открылось».
          onGlFail={noGl ? () => setGlOk(false) : undefined}
        />
      </Scene3DBoundary>
      )}

      {backHref && (
        <Link
          href={backHref}
          prefetch={false}
          className="absolute top-2 right-2 z-20 inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95"
          style={{ backgroundColor: brandColor }}
        >
          <span aria-hidden="true">←</span>
          <span>{backLabel}</span>
        </Link>
      )}
    </div>
  );
}
