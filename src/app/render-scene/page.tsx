"use client";

// Служебная страница СЕРВЕРНОГО рендера «Фото клиенту».
// Её открывает headless Chromium воркера (render-worker/, Fly.io) и до загрузки
// кладёт снапшот комнаты в window.__SNAPSHOT__ (page.addInitScript) — НЕ через query,
// снапшоты до 200 КБ. Альтернатива: window.postMessage({ type: "potolok-render", ... }).
//
// Протокол с воркером (всё через window):
//   window.__SNAPSHOT__      = { snapshot, presets }   ← кладёт воркер
//   window.__SCENE_READY__   = true                    → сцена загрузилась (HDRI/текстуры/GLB)
//   window.__SCENE_ERROR__   = "текст"                 → снапшот битый / сцена упала
//   window.__captureFrames() → Promise<{ beauty, ceilingMask, floatingMask, width, height }>
//                              (PNG data-URL, одна геройская камера, один канвас)
//
// Страница публичная, но ничего не читает из базы и никуда не пишет — только рисует
// переданный JSON. Секреты/сессии тут не участвуют.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  normalizeSnapshot,
  validateSnapshot,
  type NormalizedScene,
  type ScenePresets,
} from "@/lib/scene-snapshot";

const Scene3D = dynamic(() => import("@/components/room-3d/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
});

interface Frames {
  beauty: string;
  ceilingMask: string;
  floatingMask: string;
  width: number;
  height: number;
}

interface RenderWindow extends Window {
  __SNAPSHOT__?: { snapshot: unknown; presets?: Partial<ScenePresets> };
  __SCENE_READY__?: boolean;
  __SCENE_ERROR__?: string;
  __SCENE_STATS__?: { readyAtMs?: number; elements?: number; vertices?: number };
  __captureFrames?: () => Promise<Frames>;
}

/** PNG beauty-кадр → JPEG q0.94: в 5-8 раз меньше (лимит тела Vercel-функции 4.5 МБ),
 * для AI и заморозки потолка разницы не видно. Маски остаются PNG (они крошечные). */
function toJpeg(dataUrl: string): Promise<{ url: string; w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) {
        resolve({ url: dataUrl, w: img.naturalWidth, h: img.naturalHeight });
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({ url: c.toDataURL("image/jpeg", 0.94), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => resolve({ url: dataUrl, w: 0, h: 0 });
    img.src = dataUrl;
  });
}

export default function RenderScenePage() {
  const [input, setInput] = useState<{ scene: NormalizedScene; presets: Partial<ScenePresets> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureTrigger, setCaptureTrigger] = useState(0);
  const pending = useRef<{ resolve: (f: Frames) => void; reject: (e: Error) => void } | null>(null);

  const accept = useCallback((payload: RenderWindow["__SNAPSHOT__"]) => {
    const w = window as RenderWindow;
    try {
      if (!payload) throw new Error("нет снапшота");
      const scene = normalizeSnapshot(validateSnapshot(payload.snapshot));
      w.__SCENE_STATS__ = { elements: scene.elements.length, vertices: scene.vertices.length };
      setInput({ scene, presets: payload.presets ?? {} });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      w.__SCENE_ERROR__ = msg;
      setError(msg);
    }
  }, []);

  useEffect(() => {
    const w = window as RenderWindow;
    w.__captureFrames = () =>
      new Promise<Frames>((resolve, reject) => {
        if (!w.__SCENE_READY__) {
          reject(new Error("сцена ещё не готова"));
          return;
        }
        pending.current = { resolve, reject };
        setCaptureTrigger((n) => n + 1);
      });
    if (w.__SNAPSHOT__) accept(w.__SNAPSHOT__);
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { type?: string; snapshot?: unknown; presets?: Partial<ScenePresets> };
      if (d?.type === "potolok-render") accept({ snapshot: d.snapshot, presets: d.presets });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [accept]);

  const onSceneReady = useCallback(() => {
    const w = window as RenderWindow;
    w.__SCENE_STATS__ = { ...(w.__SCENE_STATS__ ?? {}), readyAtMs: Math.round(performance.now()) };
    w.__SCENE_READY__ = true;
  }, []);

  const onFrames = useCallback((beauty: string, ceilingMask: string, floatingMask: string) => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    toJpeg(beauty).then(({ url, w, h }) => p.resolve({ beauty: url, ceilingMask, floatingMask, width: w, height: h }));
  }, []);

  const initialLook = useMemo(
    () =>
      input
        ? {
            finish: input.presets.finish,
            colorId: input.presets.colorId,
            lightTempKey: input.presets.lightTempKey,
            floorId: input.presets.floorId,
            wallId: input.presets.wallId,
          }
        : undefined,
    [input],
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#e5e7eb" }}>
      {error && (
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 50, font: "14px monospace", color: "#b91c1c" }}>
          render-scene: {error}
        </div>
      )}
      {input && (
        <Scene3D
          vertices={input.scene.vertices}
          walls={input.scene.walls}
          ceilingHeight={input.scene.ceilingHeight}
          elements={input.scene.elements}
          shadowGapWalls={input.scene.shadowGapWalls}
          renderMode
          initialLook={initialLook}
          onSceneReady={onSceneReady}
          captureTrigger={captureTrigger}
          devCapture={onFrames}
        />
      )}
    </div>
  );
}
