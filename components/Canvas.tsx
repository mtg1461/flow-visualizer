"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { Explanation } from "@/lib/types";
import { partColors } from "@/lib/meta";
import {
  CELL_H,
  CELL_W,
  GX,
  GY,
  NODE_H,
  NODE_W,
  type EdgeRef,
  type Pos,
  type Selection,
  edgeKey,
  nearestFreeCell,
  routeEdges,
} from "@/lib/graph";
import { NodeTile } from "./NodeTile";

interface Props {
  doc: Explanation;
  positions: Map<string, Pos>;
  selection: Selection | null;
  connectFrom: string | null;
  onSelect: (sel: Selection) => void;
  onClearSelection: () => void;
  onMoveNode: (id: string, cell: Pos) => void;
  onStartConnect: (id: string) => void;
  onCompleteConnect: (to: string) => void;
  onCancelConnect: () => void;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const EDGE_STYLE = {
  forward: { stroke: "rgba(236,236,243,0.35)", dash: undefined, marker: "soft" },
  feedback: { stroke: "rgba(224,180,99,0.8)", dash: "5 5", marker: "amber" },
  loop: { stroke: "rgba(143,143,252,0.7)", dash: "2.5 6", marker: "accent" },
} as const;

export function Canvas({
  doc,
  positions,
  selection,
  connectFrom,
  onSelect,
  onClearSelection,
  onMoveNode,
  onStartConnect,
  onCompleteConnect,
  onCancelConnect,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 80, y: 60, k: 1 });
  const [drag, setDrag] = useState<{ id: string; wx: number; wy: number } | null>(
    null
  );
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const panRef = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);
  const dragRef = useRef<{
    id: string;
    offX: number;
    offY: number;
    moved: boolean;
  } | null>(null);

  const colors = useMemo(() => partColors(doc), [doc]);
  const partsById = useMemo(
    () => new Map((doc.parts ?? []).map((p) => [p.id, p])),
    [doc]
  );

  const viewRef = useRef(view);
  viewRef.current = view;

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = rootRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - v.x) / v.k,
      y: (clientY - rect.top - v.y) / v.k,
    };
  }, []);

  // dragged tile snaps live so edges re-route cell by cell
  const dragCell = useMemo(() => {
    if (!drag) return null;
    return nearestFreeCell(
      positions,
      (drag.wx - GX) / CELL_W,
      (drag.wy - GY) / CELL_H,
      drag.id
    );
  }, [drag, positions]);

  const livePositions = useMemo(() => {
    if (!drag || !dragCell) return positions;
    const m = new Map(positions);
    m.set(drag.id, dragCell);
    return m;
  }, [positions, drag, dragCell]);

  const edges = useMemo(
    () => routeEdges(doc, livePositions),
    [doc, livePositions]
  );

  const fit = useCallback(() => {
    const root = rootRef.current;
    if (!root || positions.size === 0) return;
    let maxX = 0;
    let maxY = 0;
    for (const p of positions.values()) {
      maxX = Math.max(maxX, p.col * CELL_W + CELL_W);
      maxY = Math.max(maxY, p.row * CELL_H + CELL_H);
    }
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    const k = Math.min(Math.max(Math.min((cw - 80) / maxX, (ch - 80) / maxY), 0.3), 1.15);
    setView({ x: (cw - maxX * k) / 2, y: Math.max(24, (ch - maxY * k) / 2), k });
  }, [positions]);

  const fitOnce = useRef(false);
  useLayoutEffect(() => {
    if (!fitOnce.current && positions.size > 0) {
      fitOnce.current = true;
      fit();
    }
  }, [positions, fit]);

  // keep the flow fitted while the user hasn't taken control of the view
  const userMovedView = useRef(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!userMovedView.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // wheel zoom — native listener so preventDefault works
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMovedView.current = true;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(1.8, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0014)));
        return {
          k,
          x: cx - ((cx - v.x) * k) / v.k,
          y: cy - ((cy - v.y) * k) / v.k,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    const el = rootRef.current;
    if (!el) return;
    userMovedView.current = true;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const k = Math.min(1.8, Math.max(0.3, v.k * factor));
      return {
        k,
        x: cx - ((cx - v.x) * k) / v.k,
        y: cy - ((cy - v.y) * k) / v.k,
      };
    });
  };

  // background pan
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panRef.current = {
      px: e.clientX,
      py: e.clientY,
      ox: view.x,
      oy: view.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (connectFrom) setCursor(toWorld(e.clientX, e.clientY));
    const pan = panRef.current;
    if (pan) {
      const dx = e.clientX - pan.px;
      const dy = e.clientY - pan.py;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        pan.moved = true;
        userMovedView.current = true;
      }
      if (pan.moved) setView((v) => ({ ...v, x: pan.ox + dx, y: pan.oy + dy }));
    }
  };

  const onPointerUp = () => {
    const pan = panRef.current;
    panRef.current = null;
    if (pan && !pan.moved) {
      if (connectFrom) onCancelConnect();
      else onClearSelection();
    }
  };

  // node dragging via window listeners
  const startNodeDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    const p = positions.get(id);
    if (!p) return;
    dragRef.current = {
      id,
      offX: w.x - (p.col * CELL_W + GX),
      offY: w.y - (p.row * CELL_H + GY),
      moved: false,
    };

    let last: { wx: number; wy: number } | null = null;
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const wp = toWorld(ev.clientX, ev.clientY);
      if (!d.moved) {
        const sp = positions.get(d.id)!;
        const sx = sp.col * CELL_W + GX + d.offX;
        const sy = sp.row * CELL_H + GY + d.offY;
        if (Math.abs(wp.x - sx) + Math.abs(wp.y - sy) < 6) return;
        d.moved = true;
      }
      last = { wx: wp.x - d.offX, wy: wp.y - d.offY };
      setDrag({ id: d.id, ...last });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.moved) {
        // click, not drag
        if (connectFrom && connectFrom !== d.id) onCompleteConnect(d.id);
        else if (connectFrom === d.id) onCancelConnect();
        else onSelect({ kind: "step", id: d.id });
      } else if (last) {
        const cell = nearestFreeCell(
          positions,
          (last.wx - GX) / CELL_W,
          (last.wy - GY) / CELL_H,
          d.id
        );
        onMoveNode(d.id, cell);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const selectedEdgeKey =
    selection?.kind === "edge" ? edgeKey(selection.ref) : null;

  const connectSource = connectFrom ? positions.get(connectFrom) : null;

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`relative h-full w-full overflow-hidden ${
        panRef.current?.moved ? "cursor-grabbing" : "cursor-grab"
      } ${connectFrom ? "cursor-crosshair" : ""}`}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: "0 0",
        }}
      >
        {/* dot grid */}
        <div
          aria-hidden
          className="absolute -inset-[4000px]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1.4px)",
            backgroundSize: "26px 26px",
          }}
        />

        {/* drop ghost */}
        {drag && dragCell && (
          <div
            aria-hidden
            className="absolute rounded-xl border border-dashed border-accent/40"
            style={{
              left: dragCell.col * CELL_W + GX,
              top: dragCell.row * CELL_H + GY,
              width: NODE_W,
              height: NODE_H,
            }}
          />
        )}

        {/* edges */}
        <svg
          className="absolute left-0 top-0 overflow-visible"
          width="1"
          height="1"
          aria-hidden
        >
          <defs>
            {(
              [
                ["soft", "rgba(236,236,243,0.55)"],
                ["amber", "rgba(224,180,99,0.95)"],
                ["accent", "rgba(143,143,252,0.9)"],
                ["teal", "rgba(108,199,178,0.9)"],
              ] as const
            ).map(([name, color]) => (
              <marker
                key={name}
                id={`tip-${name}`}
                viewBox="0 0 8 8"
                refX="6"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0.8 0.8 L 6.4 4 L 0.8 7.2"
                  fill="none"
                  stroke={color}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </marker>
            ))}
          </defs>
          {edges.map((edge) => {
            const style =
              edge.kind === "loop"
                ? EDGE_STYLE.loop
                : edge.backward
                  ? EDGE_STYLE.feedback
                  : EDGE_STYLE.forward;
            const isSel = selectedEdgeKey === edge.key;
            return (
              <g key={edge.key}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  className="cursor-pointer"
                  style={{ pointerEvents: "stroke" }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: "edge", ref: edge.ref });
                  }}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke={isSel ? "rgba(143,143,252,0.95)" : style.stroke}
                  strokeWidth={isSel ? 2 : 1.3}
                  strokeDasharray={style.dash}
                  markerEnd={`url(#tip-${isSel ? "accent" : style.marker})`}
                  className="pointer-events-none"
                />
              </g>
            );
          })}

          {/* connect preview */}
          {connectFrom && connectSource && cursor && (
            <path
              d={`M ${connectSource.col * CELL_W + GX + NODE_W / 2} ${
                connectSource.row * CELL_H + GY + NODE_H
              } C ${connectSource.col * CELL_W + GX + NODE_W / 2} ${
                connectSource.row * CELL_H + GY + NODE_H + 70
              }, ${cursor.x} ${cursor.y - 70}, ${cursor.x} ${cursor.y}`}
              fill="none"
              stroke="rgba(108,199,178,0.8)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              markerEnd="url(#tip-teal)"
              className="pointer-events-none"
            />
          )}
        </svg>

        {/* edge labels */}
        {edges
          .filter((e) => e.label)
          .map((edge) => {
            const isSel = selectedEdgeKey === edge.key;
            const tone =
              edge.kind === "loop"
                ? "border-accent/25 text-accent/90"
                : edge.backward
                  ? "border-amber/25 text-amber/90"
                  : "border-line-strong text-mute";
            return (
              <button
                key={`lbl-${edge.key}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "edge", ref: edge.ref });
                }}
                className={`absolute max-w-[170px] -translate-x-1/2 -translate-y-1/2 cursor-pointer truncate rounded-full border bg-bg/95 px-2 py-0.5 text-[10px] leading-4 backdrop-blur-sm ${tone} ${
                  isSel ? "ring-1 ring-accent/50" : ""
                }`}
                style={{ left: edge.labelX, top: edge.labelY }}
              >
                {edge.label}
              </button>
            );
          })}

        {/* tiles */}
        {doc.steps.map((step) => {
          const p = livePositions.get(step.id);
          if (!p) return null;
          const isDragging = drag?.id === step.id;
          const x = isDragging && drag ? drag.wx : p.col * CELL_W + GX;
          const y = isDragging && drag ? drag.wy : p.row * CELL_H + GY;
          return (
            <NodeTile
              key={step.id}
              step={step}
              x={x}
              y={y}
              selected={selection?.kind === "step" && selection.id === step.id}
              connectSource={connectFrom === step.id}
              connectTarget={!!connectFrom && connectFrom !== step.id}
              dragging={isDragging}
              partName={
                step.part
                  ? (partsById.get(step.part)?.name ?? step.part)
                  : undefined
              }
              partColor={step.part ? colors.get(step.part) : undefined}
              onPointerDown={startNodeDrag(step.id)}
              onPortClick={() =>
                connectFrom === step.id
                  ? onCancelConnect()
                  : onStartConnect(step.id)
              }
            />
          );
        })}
      </div>

      {/* connect-mode hint */}
      {connectFrom && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-teal/30 bg-bg/90 px-3.5 py-1.5 text-[11.5px] text-teal backdrop-blur">
          Click a tile to connect — Esc to cancel
        </div>
      )}

      {/* zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border border-line bg-surface/90 p-1 backdrop-blur">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.25)}
          onPointerDown={(e) => e.stopPropagation()}
          className="cursor-pointer rounded-md p-1.5 text-mute transition-colors hover:bg-line hover:text-text"
        >
          <Minus size={13} />
        </button>
        <span className="w-10 text-center text-[11px] tabular-nums text-faint">
          {Math.round(view.k * 100)}%
        </span>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.25)}
          onPointerDown={(e) => e.stopPropagation()}
          className="cursor-pointer rounded-md p-1.5 text-mute transition-colors hover:bg-line hover:text-text"
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          aria-label="Fit view"
          onClick={() => {
            userMovedView.current = false;
            fit();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="cursor-pointer rounded-md p-1.5 text-mute transition-colors hover:bg-line hover:text-text"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* hint */}
      <div className="pointer-events-none absolute bottom-5 left-4 hidden text-[11px] text-faint md:block">
        drag tiles · click a tile&apos;s ○ to connect · click an edge to edit
      </div>
    </div>
  );
}
