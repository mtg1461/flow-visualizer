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
  GRID_LIMITS,
  GX,
  GY,
  NODE_H,
  NODE_W,
  type EdgeRef,
  type Pos,
  type Selection,
  edgeKey,
  groupCellRect,
  nearestFreeCell,
  routeEdges,
} from "@/lib/graph";
import { NodeTile } from "./NodeTile";

interface Props {
  doc: Explanation;
  positions: Map<string, Pos>;
  selection: Selection | null;
  connectFrom: string | null;
  /** Increment to request a fit-to-view (e.g. after Tidy). */
  fitSignal: number;
  onSelect: (sel: Selection) => void;
  onClearSelection: () => void;
  onMoveNode: (id: string, cell: Pos) => void;
  onMoveGroup: (id: string, dCol: number, dRow: number) => void;
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

const LINE_DASH = {
  solid: undefined,
  dashed: "5 5",
  dotted: "1.5 5",
} as const;

const markerId = (color: string) => `tip-c-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

export function Canvas({
  doc,
  positions,
  selection,
  connectFrom,
  fitSignal,
  onSelect,
  onClearSelection,
  onMoveNode,
  onMoveGroup,
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
  const [groupDrag, setGroupDrag] = useState<{
    id: string;
    dCol: number;
    dRow: number;
    valid: boolean;
  } | null>(null);
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
    if (drag && dragCell) {
      const m = new Map(positions);
      m.set(drag.id, dragCell);
      return m;
    }
    if (groupDrag && (groupDrag.dCol || groupDrag.dRow)) {
      const g = doc.groups?.find((x) => x.id === groupDrag.id);
      if (g) {
        const m = new Map(positions);
        for (const id of g.steps) {
          const p = positions.get(id);
          if (p)
            m.set(id, {
              col: p.col + groupDrag.dCol,
              row: p.row + groupDrag.dRow,
            });
        }
        return m;
      }
    }
    return positions;
  }, [positions, drag, dragCell, groupDrag, doc.groups]);

  const edges = useMemo(
    () => routeEdges(doc, livePositions),
    [doc, livePositions]
  );

  const customColors = useMemo(
    () => [...new Set(edges.map((e) => e.color).filter((c): c is string => !!c))],
    [edges]
  );

  const fit = useCallback(() => {
    const root = rootRef.current;
    if (!root || positions.size === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of positions.values()) {
      minX = Math.min(minX, p.col * CELL_W);
      minY = Math.min(minY, p.row * CELL_H);
      maxX = Math.max(maxX, p.col * CELL_W + CELL_W);
      maxY = Math.max(maxY, p.row * CELL_H + CELL_H);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    const k = Math.min(
      Math.max(Math.min((cw - 80) / w, (ch - 80) / h), 0.3),
      1.15
    );
    setView({
      x: (cw - w * k) / 2 - minX * k,
      y: Math.max(24, (ch - h * k) / 2) - minY * k,
      k,
    });
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

  // explicit fit requests (Tidy, JSON apply) override user view control
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (fitSignal > 0) {
      userMovedView.current = false;
      fitRef.current();
    }
  }, [fitSignal]);
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
    const el = e.target as HTMLElement;
    const tile = el.closest?.("[data-node-id]");
    if (tile) {
      onMenu(
        { type: "tile", id: (tile as HTMLElement).dataset.nodeId! },
        e.clientX,
        e.clientY
      );
      return;
    }
    const group = el.closest?.("[data-group-id]");
    if (group) {
      onMenu(
        { type: "group", id: (group as HTMLElement).dataset.groupId! },
        e.clientX,
        e.clientY
      );
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    onMenu(
      {
        type: "canvas",
        cell: nearestFreeCell(positions, (w.x - GX) / CELL_W, (w.y - GY) / CELL_H),
      },
      e.clientX,
      e.clientY
    );
  };

  // dashed region rectangles behind the tiles
  const groupRects = useMemo(() => {
    return (doc.groups ?? [])
      .map((g) => {
        const shifting =
          groupDrag && groupDrag.id === g.id
            ? { dc: groupDrag.dCol, dr: groupDrag.dRow }
            : { dc: 0, dr: 0 };
        const effective = g.grid
          ? {
              ...g,
              grid: {
                ...g.grid,
                col: g.grid.col + shifting.dc,
                row: g.grid.row + shifting.dr,
              },
            }
          : g;
        const rect = groupCellRect(effective, livePositions);
        if (!rect) return null;
        return {
          id: g.id,
          label: g.label,
          color: g.color ?? "#9b9bff",
          invalid: groupDrag?.id === g.id && !groupDrag.valid,
          left: rect.minC * CELL_W + GX - 18,
          top: rect.minR * CELL_H + GY - 34,
          width: (rect.maxC - rect.minC) * CELL_W + NODE_W + 36,
          height: (rect.maxR - rect.minR) * CELL_H + NODE_H + 52,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [doc.groups, livePositions, groupDrag]);

  // group dragging — moves every member tile by a cell delta
  const groupDragRef = useRef<{
    id: string;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);

  const startGroupDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    groupDragRef.current = { id, sx: w.x, sy: w.y, moved: false };
    let last: { dCol: number; dRow: number; valid: boolean } | null = null;

    const move = (ev: PointerEvent) => {
      const d = groupDragRef.current;
      if (!d) return;
      const wp = toWorld(ev.clientX, ev.clientY);
      if (!d.moved && Math.abs(wp.x - d.sx) + Math.abs(wp.y - d.sy) < 8) return;
      d.moved = true;
      const dCol = Math.round((wp.x - d.sx) / CELL_W);
      const dRow = Math.round((wp.y - d.sy) / CELL_H);
      const g = doc.groups?.find((x) => x.id === d.id);
      let valid = true;
      if (g) {
        const members = new Set(g.steps);
        outer: for (const sid of g.steps) {
          const p = positions.get(sid);
          if (!p) continue;
          const c = p.col + dCol;
          const r = p.row + dRow;
          if (
            c < GRID_LIMITS.minCol ||
            c > GRID_LIMITS.maxCol ||
            r < GRID_LIMITS.minRow ||
            r > GRID_LIMITS.maxRow
          ) {
            valid = false;
            break;
          }
          for (const [oid, op] of positions) {
            if (!members.has(oid) && op.col === c && op.row === r) {
              valid = false;
              break outer;
            }
          }
        }
      }
      last = { dCol, dRow, valid };
      setGroupDrag({ id: d.id, dCol, dRow, valid });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = groupDragRef.current;
      groupDragRef.current = null;
      setGroupDrag(null);
      if (!d) return;
      if (!d.moved) {
        if (connectFrom) onCancelConnect();
        else onSelect({ kind: "group", id: d.id });
      } else if (last && last.valid && (last.dCol || last.dRow)) {
        onMoveGroup(d.id, last.dCol, last.dRow);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
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
        {/* tile-slot lattice — shows exactly where tiles can land */}
        <div
          aria-hidden
          className="absolute transition-opacity duration-200"
          style={{
            left: GRID_LIMITS.minCol * CELL_W,
            top: GRID_LIMITS.minRow * CELL_H,
            width: (GRID_LIMITS.maxCol - GRID_LIMITS.minCol + 1) * CELL_W,
            height: (GRID_LIMITS.maxRow - GRID_LIMITS.minRow + 1) * CELL_H,
            opacity: drag ? 1 : 0.6,
            backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
              `<svg xmlns='http://www.w3.org/2000/svg' width='${CELL_W}' height='${CELL_H}'><rect x='${GX}' y='${GY}' width='${NODE_W}' height='${NODE_H}' rx='10' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='1.5' stroke-dasharray='6 7'/></svg>`
            )}")`,
            backgroundSize: `${CELL_W}px ${CELL_H}px`,
          }}
        />

        {/* group regions — interactive: click selects, drag moves members */}
        {groupRects.map((r) => {
          const isSel = selection?.kind === "group" && selection.id === r.id;
          return (
            <div
              key={r.id}
              data-group-id={r.id}
              onPointerDown={startGroupDrag(r.id)}
              className="absolute cursor-move rounded-2xl border-[1.5px] border-dashed transition-[box-shadow] duration-150"
              style={{
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                borderColor: r.invalid
                  ? "rgba(239,156,190,0.9)"
                  : isSel
                    ? r.color
                    : withAlpha(r.color, "a6"),
                background: r.invalid
                  ? "rgba(239,156,190,0.08)"
                  : withAlpha(r.color, "1c"),
                boxShadow: isSel
                  ? `0 0 0 3px ${withAlpha(r.color, "38")}`
                  : undefined,
              }}
            >
              <span
                className="absolute left-2.5 top-2 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  color: r.color,
                  background: withAlpha(r.color, "30"),
                }}
              >
                {r.label}
              </span>
            </div>
          );
        })}

        {/* drop ghost */}
        {drag && dragCell && (
          <div
            aria-hidden
            className="absolute rounded-[10px] border-2 border-dashed border-accent/70 bg-accent/10"
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
            {customColors.map((color) => (
              <marker
                key={color}
                id={markerId(color)}
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
            const base =
              edge.kind === "loop"
                ? EDGE_STYLE.loop
                : edge.backward
                  ? EDGE_STYLE.feedback
                  : EDGE_STYLE.forward;
            const style = {
              stroke: edge.color ?? base.stroke,
              dash: edge.line ? LINE_DASH[edge.line] : base.dash,
              marker: edge.color ? markerId(edge.color) : `tip-${base.marker}`,
            };
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
                  stroke={style.stroke}
                  strokeWidth={isSel ? 2.4 : 1.4}
                  strokeDasharray={style.dash}
                  markerEnd={`url(#${style.marker})`}
                  className="pointer-events-none"
                  style={
                    isSel
                      ? { filter: "drop-shadow(0 0 4px rgba(255,255,255,0.45))" }
                      : undefined
                  }
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
            const tone = edge.color
              ? ""
              : edge.kind === "loop"
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
                style={{
                  left: edge.labelX,
                  top: edge.labelY,
                  ...(edge.color
                    ? {
                        color: edge.color,
                        borderColor: withAlpha(edge.color, "80"),
                      }
                    : {}),
                }}
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
