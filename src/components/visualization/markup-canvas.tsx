"use client";

// SVG-overlay поверх фото комнаты для разметки точек спотов, линий треков, люстр.
// Координаты хранятся в процентах (0..100) от размеров фото — это даёт устойчивость
// к ресайзу и помогает Gemini понимать "ставь трек по верхней части потолка" через
// numerical coordinates в промпте.

import { useEffect, useRef, useState, useCallback } from "react";

export type MarkupTool =
  | "select"
  | "spot"
  | "track"
  | "chandelier"
  | "lightline"
  | "boundary";

export interface MarkupPoint {
  id: string;
  type: "spot" | "chandelier";
  x: number; // 0..100 (% от ширины)
  y: number; // 0..100 (% от высоты)
  elementId?: string; // привязка к CeilingElement в библиотеке
}

export interface MarkupLine {
  id: string;
  type: "track" | "lightline";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  elementId?: string;
}

export interface MarkupData {
  points: MarkupPoint[];
  lines: MarkupLine[];
  /** Полигон границы потолка (минимум 3 точки) — для генерации маски FLUX Fill */
  ceilingPolygon?: Array<{ x: number; y: number }>;
}

interface LibraryElement {
  id: string;
  category: string;
  name: string;
  imageUrl: string;
}

interface Props {
  photoUrl: string;
  markup: MarkupData;
  onChange: (markup: MarkupData) => void;
  library: LibraryElement[];
  /** ID визуализации — нужен для auto-ceiling API */
  vizId: string | null;
}

const TOOLS: Array<{ tool: MarkupTool; label: string; emoji: string; categoryHint?: string }> = [
  { tool: "select", label: "Двигать", emoji: "✋" },
  { tool: "boundary", label: "Граница потолка", emoji: "⬜" },
  { tool: "spot", label: "Спот", emoji: "🔘", categoryHint: "spot" },
  { tool: "track", label: "Трек", emoji: "━━", categoryHint: "track" },
  { tool: "lightline", label: "Линия", emoji: "═", categoryHint: "lightline" },
  { tool: "chandelier", label: "Люстра", emoji: "💡", categoryHint: "chandelier" },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

type DragTarget =
  | { kind: "polygon"; index: number }
  | { kind: "point"; id: string }
  | { kind: "line"; id: string; end: "start" | "end" };

export function MarkupCanvas({ photoUrl, markup, onChange, library, vizId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<MarkupTool>("select");
  // Для line/track: первый клик ставит startPoint, второй — завершает линию.
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  // Выбранный элемент из библиотеки для текущего инструмента
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [drag, setDrag] = useState<DragTarget | null>(null);
  // Флаг "только что закончился drag" — чтобы клик после mouseup не ставил новую точку
  const justDraggedRef = useRef(false);

  // Глобальные mousemove/up — drag работает даже если палец вышел за SVG
  useEffect(() => {
    if (!drag) return;

    function getCoordsFromEvent(e: PointerEvent) {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    }

    function onMove(e: PointerEvent) {
      const coords = getCoordsFromEvent(e);
      if (!coords) return;
      if (drag!.kind === "polygon" && markup.ceilingPolygon) {
        const next = markup.ceilingPolygon.map((p, i) =>
          i === drag!.index ? coords : p,
        );
        onChange({ ...markup, ceilingPolygon: next });
      } else if (drag!.kind === "point") {
        const next = markup.points.map((p) =>
          p.id === drag!.id ? { ...p, x: coords.x, y: coords.y } : p,
        );
        onChange({ ...markup, points: next });
      } else if (drag!.kind === "line") {
        const next = markup.lines.map((l) => {
          if (l.id !== drag!.id) return l;
          if (drag!.end === "start") return { ...l, x1: coords.x, y1: coords.y };
          return { ...l, x2: coords.x, y2: coords.y };
        });
        onChange({ ...markup, lines: next });
      }
      e.preventDefault();
    }

    function onUp() {
      justDraggedRef.current = true;
      setDrag(null);
      // Сбрасываем флаг после того как click event отстрелял (на следующем тике event loop)
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, markup, onChange]);

  function startDrag(e: React.PointerEvent, target: DragTarget) {
    e.stopPropagation();
    e.preventDefault();
    setDrag(target);
  }

  async function handleAutoDetectCeiling() {
    if (!vizId) return;
    setAutoDetecting(true);
    try {
      const res = await fetch(`/api/visualizations/${vizId}/auto-ceiling`, { method: "POST" });
      const data = (await res.json()) as { polygon?: Array<{ x: number; y: number }>; error?: string };
      if (!res.ok || !data.polygon) {
        alert(data.error ?? "Не удалось автоопределить потолок");
        return;
      }
      onChange({ ...markup, ceilingPolygon: data.polygon });
      setTool("boundary");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка автоопределения");
    } finally {
      setAutoDetecting(false);
    }
  }

  const getCoords = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    },
    [],
  );

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool === "select") return;
    const { x, y } = getCoords(e);

    if (tool === "boundary") {
      const current = markup.ceilingPolygon ?? [];
      onChange({ ...markup, ceilingPolygon: [...current, { x, y }] });
      return;
    }

    if (tool === "spot" || tool === "chandelier") {
      const newPoint: MarkupPoint = {
        id: uid(),
        type: tool,
        x,
        y,
        elementId: selectedElementId ?? undefined,
      };
      onChange({ ...markup, points: [...markup.points, newPoint] });
    } else if (tool === "track" || tool === "lightline") {
      if (!lineStart) {
        setLineStart({ x, y });
      } else {
        const newLine: MarkupLine = {
          id: uid(),
          type: tool,
          x1: lineStart.x,
          y1: lineStart.y,
          x2: x,
          y2: y,
          elementId: selectedElementId ?? undefined,
        };
        onChange({ ...markup, lines: [...markup.lines, newLine] });
        setLineStart(null);
      }
    }
  }

  function handleDeletePoint(id: string) {
    onChange({ ...markup, points: markup.points.filter((p) => p.id !== id) });
  }

  function handleDeleteLine(id: string) {
    onChange({ ...markup, lines: markup.lines.filter((l) => l.id !== id) });
  }

  function handleClearAll() {
    if (!confirm("Очистить всю разметку?")) return;
    onChange({ points: [], lines: [] });
    setLineStart(null);
  }

  function handleUndo() {
    if (tool === "boundary" && markup.ceilingPolygon && markup.ceilingPolygon.length > 0) {
      onChange({ ...markup, ceilingPolygon: markup.ceilingPolygon.slice(0, -1) });
      return;
    }
    if (markup.lines.length > 0) {
      onChange({ ...markup, lines: markup.lines.slice(0, -1) });
    } else if (markup.points.length > 0) {
      onChange({ ...markup, points: markup.points.slice(0, -1) });
    }
  }

  function handleClearBoundary() {
    onChange({ ...markup, ceilingPolygon: undefined });
  }

  const currentToolCategory = TOOLS.find((t) => t.tool === tool)?.categoryHint;
  const compatibleElements = currentToolCategory
    ? library.filter((el) => el.category === currentToolCategory)
    : [];

  const totalItems = markup.points.length + markup.lines.length;

  return (
    <div className="space-y-3">
      {/* Auto-detect ceiling button */}
      {vizId && (
        <button
          type="button"
          onClick={handleAutoDetectCeiling}
          disabled={autoDetecting}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-bold text-white shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {autoDetecting ? "🪄 AI определяет потолок..." : "🪄 Авто-определить границу потолка"}
        </button>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-2">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            onClick={() => {
              setTool(t.tool);
              setLineStart(null);
              setSelectedElementId(null);
            }}
            className={`rounded px-2.5 py-1.5 text-xs font-medium transition ${
              tool === t.tool
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-700 hover:bg-slate-200"
            }`}
            title={t.label}
          >
            <span className="mr-1">{t.emoji}</span>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={totalItems === 0}
            className="rounded bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={totalItems === 0}
            className="rounded bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            ✕ Очистить
          </button>
        </div>
      </div>

      {/* Element picker for current tool */}
      {tool !== "select" && compatibleElements.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2">
          <span className="text-xs font-semibold text-emerald-800">
            Привязать к элементу:
          </span>
          <select
            value={selectedElementId ?? ""}
            onChange={(e) => setSelectedElementId(e.target.value || null)}
            className="flex-1 rounded border border-emerald-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">— без привязки (просто пометить место) —</option>
            {compatibleElements.map((el) => (
              <option key={el.id} value={el.id}>
                {el.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {tool === "select" && (markup.points.length + markup.lines.length + (markup.ceilingPolygon?.length ?? 0)) > 0 && (
        <div className="rounded bg-slate-100 p-2 text-xs text-slate-600">
          ✋ Тащи кружки чтобы двигать точки и концы линий · кликни × чтобы удалить
        </div>
      )}

      {/* Hint for current tool */}
      {tool !== "select" && (
        <div className="rounded bg-indigo-50 p-2 text-xs text-indigo-700">
          {tool === "spot" && "💡 Тапни по фото — поставь точечный спот"}
          {tool === "chandelier" && "💡 Тапни по фото — поставь люстру"}
          {(tool === "track" || tool === "lightline") &&
            (lineStart
              ? "📍 Начало линии поставлено — тапни вторую точку чтобы завершить"
              : `💡 Тапни первую точку — начало ${tool === "track" ? "трека" : "светящейся линии"}`)}
          {tool === "boundary" && (
            <span>
              ⬜ Обведи область потолка кликами по углам (минимум 3 точки, обычно 4 — по углам комнаты). После этого AI 100% натянет потолок точно в этой зоне.
              {markup.ceilingPolygon && markup.ceilingPolygon.length > 0 && (
                <>
                  {" "}Точек: {markup.ceilingPolygon.length}.
                  <button
                    type="button"
                    onClick={handleClearBoundary}
                    className="ml-2 underline hover:text-rose-700"
                  >
                    очистить
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      )}

      {/* Photo + SVG overlay */}
      <div ref={containerRef} className="relative overflow-hidden rounded-lg border border-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl} alt="комната" className="block w-full select-none" draggable={false} />
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={`absolute inset-0 h-full w-full ${
            tool === "select" ? "" : "cursor-crosshair"
          }`}
          onClick={(e) => {
            // Не обрабатываем клик если только что закончили drag (pointerup срабатывает раньше click)
            if (drag || justDraggedRef.current) return;
            handleClick(e);
          }}
          style={{ touchAction: "none" }}
        >
          {/* Ceiling boundary polygon (under everything else) */}
          {markup.ceilingPolygon && markup.ceilingPolygon.length > 0 && (
            <g>
              {markup.ceilingPolygon.length >= 3 ? (
                <polygon
                  points={markup.ceilingPolygon.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(59, 130, 246, 0.2)"
                  stroke="#2563eb"
                  strokeWidth="0.4"
                  strokeDasharray="0.8 0.8"
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                <polyline
                  points={markup.ceilingPolygon.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="0.4"
                  strokeDasharray="0.8 0.8"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {markup.ceilingPolygon.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="1.6"
                  fill="#2563eb"
                  stroke="white"
                  strokeWidth="0.4"
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: tool === "select" ? "grab" : "default", touchAction: "none" }}
                  onPointerDown={(e) => {
                    if (tool !== "select" && tool !== "boundary") return;
                    startDrag(e, { kind: "polygon", index: i });
                  }}
                />
              ))}
            </g>
          )}

          {/* Existing lines */}
          {markup.lines.map((l) => (
            <g key={l.id}>
              <line
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={l.type === "track" ? "#dc2626" : "#fbbf24"}
                strokeWidth="0.6"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 1px rgba(0,0,0,0.5))" }}
              />
              {tool === "select" && (
                <>
                  {/* Drag-ручка начала линии */}
                  <circle
                    cx={l.x1}
                    cy={l.y1}
                    r="1.6"
                    fill={l.type === "track" ? "#dc2626" : "#fbbf24"}
                    stroke="white"
                    strokeWidth="0.4"
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: "grab", touchAction: "none" }}
                    onPointerDown={(e) => startDrag(e, { kind: "line", id: l.id, end: "start" })}
                  />
                  {/* Drag-ручка конца линии */}
                  <circle
                    cx={l.x2}
                    cy={l.y2}
                    r="1.6"
                    fill={l.type === "track" ? "#dc2626" : "#fbbf24"}
                    stroke="white"
                    strokeWidth="0.4"
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: "grab", touchAction: "none" }}
                    onPointerDown={(e) => startDrag(e, { kind: "line", id: l.id, end: "end" })}
                  />
                  {/* Удалить — × посередине */}
                  <g
                    transform={`translate(${(l.x1 + l.x2) / 2},${(l.y1 + l.y2) / 2})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLine(l.id);
                    }}
                  >
                    <circle r="1.4" fill="white" stroke="#dc2626" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                    <text y="0.5" fontSize="1.8" textAnchor="middle" fill="#dc2626" style={{ pointerEvents: "none" }}>
                      ×
                    </text>
                  </g>
                </>
              )}
            </g>
          ))}

          {/* In-progress line preview */}
          {lineStart && (tool === "track" || tool === "lightline") && (
            <circle cx={lineStart.x} cy={lineStart.y} r="1" fill="#fbbf24" />
          )}

          {/* Existing points */}
          {markup.points.map((p) => (
            <g key={p.id}>
              {p.type === "spot" ? (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="1.6"
                  fill="#10b981"
                  stroke="white"
                  strokeWidth="0.4"
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: tool === "select" ? "grab" : "default", touchAction: "none" }}
                  onPointerDown={(e) => {
                    if (tool !== "select") return;
                    startDrag(e, { kind: "point", id: p.id });
                  }}
                />
              ) : (
                <g
                  transform={`translate(${p.x},${p.y})`}
                  style={{ cursor: tool === "select" ? "grab" : "default", touchAction: "none" }}
                  onPointerDown={(e) => {
                    if (tool !== "select") return;
                    startDrag(e, { kind: "point", id: p.id });
                  }}
                >
                  <circle r="2" fill="#a855f7" stroke="white" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                  <text
                    y="0.6"
                    fontSize="2"
                    textAnchor="middle"
                    fill="white"
                    style={{ pointerEvents: "none" }}
                  >
                    💡
                  </text>
                </g>
              )}
              {tool === "select" && (
                <g
                  transform={`translate(${p.x + 2},${p.y - 2.5})`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePoint(p.id);
                  }}
                >
                  <circle r="1.2" fill="white" stroke="#dc2626" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
                  <text y="0.5" fontSize="1.6" textAnchor="middle" fill="#dc2626" style={{ pointerEvents: "none" }}>
                    ×
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Summary */}
      {totalItems > 0 && (
        <div className="text-xs text-slate-500">
          На фото размечено:
          {markup.points.filter((p) => p.type === "spot").length > 0 &&
            ` 🔘 спотов ${markup.points.filter((p) => p.type === "spot").length}`}
          {markup.points.filter((p) => p.type === "chandelier").length > 0 &&
            ` · 💡 люстр ${markup.points.filter((p) => p.type === "chandelier").length}`}
          {markup.lines.filter((l) => l.type === "track").length > 0 &&
            ` · ━━ треков ${markup.lines.filter((l) => l.type === "track").length}`}
          {markup.lines.filter((l) => l.type === "lightline").length > 0 &&
            ` · ═ светолиний ${markup.lines.filter((l) => l.type === "lightline").length}`}
        </div>
      )}
    </div>
  );
}
