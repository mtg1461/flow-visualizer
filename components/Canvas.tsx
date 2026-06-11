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
import { partColors, withAlpha } from "@/lib/meta";
import type { MenuTarget } from "./ContextMenu";
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
  onMenu: (target: MenuTarget, x: number, y: number) => void;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const EDGE_STYLE = {
  forward: { stroke: "rgba(232,234,248,0.65)", dash: undefined, marker: "soft" },
  feedback: { stroke: "rgba(238,194,122,1)", dash: "5 5", marker: "amber" },
  loop: { stroke: "rgba(165,165,255,1)", dash: "2.5 6", marker: "accent" },
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
  onMenu,
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

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const tile = (e.target as HTMLElement).closest?.("[data-node-id]");
    if (tile) {
      onMenu(
        { type: "tile", id: (tile as HTMLElement).dataset.nodeId! },
        e.clientX,
        e.clientY
      );
    } else {
      const w = toWorld(e.clientX, e.clientY);
      onMenu(
        {
          type: "canvas",
          cell: nearestFreeCell(positions, (w.x - GX) / CELL_W, (w.y - GY) / CELL_H),
        },
        e.clientX,
        e.clientY
      );
    }
  };

  // dashed region rectangles behind the tiles
  const groupRects = useMemo(() => {
    return (doc.groups ?? [])
      .map((g) => {
        const members = g.steps
          .map((id) => livePositions.get(id))
          .filter((p): p is Pos => !!p);
        if (!members.length) return null;
        let minC = Infinity,
          maxC = -Infinity,
          minR = Infinity,
          maxR = -Infinity;
        for (const p of members) {
          minC = Math.min(minC, p.col);
          maxC = Math.max(maxC, p.col);
          minR = Math.min(minR, p.row);
          maxR = Math.max(maxR, p.row);
        }
        const color = g.color ?? "#9b9bff";
        return {
          id: g.id,
          label: g.label,
          color,
          left: minC * CELL_W + GX - 18,
          top: minR * CELL_H + GY - 32,
          width: (maxC - minC) * CELL_W + NODE_W + 36,
          height: (maxR - minR) * CELL_H + NODE_H + 50,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [doc.groups, livePositions]);

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
      onContextMenu={onContextMenu}
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
              "radial-gradient(circle, rgba(255,255,255,0.11) 1px, transparent 1.4px)",
            backgroundSize: "26px 26px",
          }}
        />

        {/* group regions */}
        {groupRects.map((r) => (
          <div
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute rounded-2xl border border-dashed"
            style={{
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              borderColor: withAlpha(r.color, "73"),
              background: withAlpha(r.color, "10"),
            }}
          >
            <span
              className="absolute left-3.5 top-2 text-[10.5px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: r.color }}
            >
              {r.label}
            </span>
          </div>
        ))}

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
                ["soft", "rgba(232,234,248,0.9)"],
                ["amber", "rgba(238,194,122,1)"],
                ["accent", "rgba(165,165,255,1)"],
                ["teal", "rgba(127,214,194,1)"],
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
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect({ kind: "edge", ref: edge.ref });
                    onMenu({ type: "edge", ref: edge.ref }, e.clientX, e.clientY);
                  }}
                />
                <path
                  d={edge.d}
                  fill="none"
                  stroke={isSel ? "rgba(185,185,255,1)" : style.stroke}
                  strokeWidth={isSel ? 2.2 : 1.4}
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
                ? "border-accent/50 text-accent"
                : edge.backward
                  ? "border-amber/50 text-amber"
                  : "border-line-strong text-text/90";
            return (
              <button
                key={`lbl-${edge.key}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: "edge", ref: edge.ref });
                }}
                className={`absolute max-w-[170px] -translate-x-1/2 -translate-y-1/2 cursor-pointer truncate rounded-md border bg-raise px-2 py-0.5 text-[11px] leading-4 shadow-md shadow-black/40 ${tone} ${
                  isSel ? "ring-1 ring-accent/60" : ""
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
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMenu({ type: "tile", id: step.id }, e.clientX, e.clientY);
              }}
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
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-teal/40 bg-raise px-3.5 py-1.5 text-[12px] text-teal shadow-lg shadow-black/30">
          Click a tile to connect — Esc to cancel
        </div>
      )}

      {/* zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border border-line-strong bg-raise p-1 shadow-lg shadow-black/30">
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
      <div className="pointer-events-none absolute bottom-5 left-4 hidden text-[11.5px] text-mute md:block">
        right-click for actions
      </div>
    </div>
  );
}
