"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface PinchZoomProps {
  children: ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
}

/**
 * Wrapper that adds pinch-to-zoom and pan to any content (SVG, images, etc.)
 * Works on mobile (touch) and desktop (wheel + drag).
 */
export function PinchZoom({
  children,
  className = "",
  minScale = 1,
  maxScale = 5,
}: PinchZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Touch tracking refs (avoid re-renders during gesture)
  const touchState = useRef<{
    initialDistance: number;
    initialScale: number;
    initialMid: { x: number; y: number };
    initialTranslate: { x: number; y: number };
    // Single finger pan
    lastTouch: { x: number; y: number } | null;
  } | null>(null);

  const isZoomed = scale > 1.05;

  const clampTranslate = useCallback(
    (tx: number, ty: number, s: number) => {
      if (s <= 1) return { x: 0, y: 0 };
      const container = containerRef.current;
      if (!container) return { x: tx, y: ty };
      const rect = container.getBoundingClientRect();
      const maxTx = (rect.width * (s - 1)) / 2;
      const maxTy = (rect.height * (s - 1)) / 2;
      return {
        x: Math.max(-maxTx, Math.min(maxTx, tx)),
        y: Math.max(-maxTy, Math.min(maxTy, ty)),
      };
    },
    []
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        touchState.current = {
          initialDistance: dist,
          initialScale: scale,
          initialMid: {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
          },
          initialTranslate: { ...translate },
          lastTouch: null,
        };
      } else if (e.touches.length === 1 && isZoomed) {
        // Pan start (only when zoomed in)
        touchState.current = {
          initialDistance: 0,
          initialScale: scale,
          initialMid: { x: 0, y: 0 },
          initialTranslate: { ...translate },
          lastTouch: {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          },
        };
      }
    },
    [scale, translate, isZoomed]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchState.current) return;

      if (e.touches.length === 2) {
        // Pinch move
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const ratio = dist / touchState.current.initialDistance;
        const newScale = Math.max(minScale, Math.min(maxScale, touchState.current.initialScale * ratio));

        // Pan follows midpoint movement
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const dx = midX - touchState.current.initialMid.x;
        const dy = midY - touchState.current.initialMid.y;

        const newT = clampTranslate(
          touchState.current.initialTranslate.x + dx,
          touchState.current.initialTranslate.y + dy,
          newScale
        );

        setScale(newScale);
        setTranslate(newT);
      } else if (e.touches.length === 1 && touchState.current.lastTouch) {
        // Pan move
        e.preventDefault();
        const dx = e.touches[0].clientX - touchState.current.lastTouch.x;
        const dy = e.touches[0].clientY - touchState.current.lastTouch.y;
        touchState.current.lastTouch = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setTranslate((prev) => clampTranslate(prev.x + dx, prev.y + dy, scale));
      }
    },
    [minScale, maxScale, scale, clampTranslate]
  );

  const handleTouchEnd = useCallback(() => {
    touchState.current = null;
    // Snap back if scale is near 1
    setScale((s) => {
      if (s < 1.1) {
        setTranslate({ x: 0, y: 0 });
        return 1;
      }
      return s;
    });
  }, []);

  // Mouse wheel zoom (desktop)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => {
        const newS = Math.max(minScale, Math.min(maxScale, s * delta));
        if (newS <= 1.05) {
          setTranslate({ x: 0, y: 0 });
          return 1;
        }
        return newS;
      });
    },
    [minScale, maxScale]
  );

  const handleReset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "center center",
          touchAction: isZoomed ? "none" : "manipulation",
          transition: touchState.current ? "none" : "transform 0.15s ease-out",
        }}
      >
        {children}
      </div>
      {/* Reset button — only shown when zoomed */}
      {isZoomed && (
        <button
          onClick={handleReset}
          className="absolute top-2 right-2 z-10 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 shadow-md border border-gray-200 active:scale-95"
        >
          {Math.round(scale * 100)}% ×
        </button>
      )}
    </div>
  );
}
