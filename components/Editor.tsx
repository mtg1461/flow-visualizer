"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdgeLine, Explanation, Step } from "@/lib/types";
import { SAMPLE } from "@/lib/sample";
import {
  GRID_LIMITS,
  type EdgeRef,
  type Pos,
  type Selection,
  cellInRect,
  groupCellRect,
  layoutPositions,
  nearestFreeCell,
  normalize,
  rectsOverlap,
  resolveGroupConflicts,
  tidyLayout,
  type CellRect,
} from "@/lib/graph";
import { Canvas } from "./Canvas";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { Inspector, type EditorActions } from "./Inspector";
import { Toolbar } from "./Toolbar";
import { JsonDialog } from "./JsonDialog";

export const STORAGE_KEY = "unfold:data";

const HISTORY_LIMIT = 100;
/** Edits with the same coalesce key inside this window share one undo entry. */
const COALESCE_MS = 1000;

interface Props {
  initial: Explanation;
  initialCustom: boolean;
}

function persist(doc: Explanation | null) {
  try {
    if (doc) localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — edits still live for this session
  }
}

/**
 * Canvas ruleset, rule 2: groups anchor their members. A tile inside a
 * group must never move because something OUTSIDE the group changed —
 * auto-layout positions tiles relative to their predecessors, so without
 * this, dragging a connected outside tile reflows unpinned members and
 * stretches the group. Every commit pins unpinned members at the cell
 * they occupied before the mutation. Tidy and JSON-apply bypass this on
 * purpose: they are the explicit "re-layout everything" actions.
 */
function stabilizeGroupMembers(
  next: Explanation,
  prevPos: Map<string, Pos>
): Explanation {
  const memberIds = new Set((next.groups ?? []).flatMap((g) => g.steps));
  if (memberIds.size === 0) return next;
  let changed = false;
  const steps = next.steps.map((s) => {
    if (!memberIds.has(s.id) || s.grid) return s;
    const p = prevPos.get(s.id);
    if (!p) return s;
    changed = true;
    return { ...s, grid: { col: p.col, row: p.row } };
  });
  return changed ? { ...next, steps } : next;
}

function rectToGrid(rect: {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}) {
  return {
    col: rect.minC,
    row: rect.minR,
    cols: rect.maxC - rect.minC + 1,
    rows: rect.maxR - rect.minR + 1,
  };
}

/** Drops a selection that points at something the restored doc lacks. */
function validSelection(
  doc: Explanation,
  sel: Selection | null
): Selection | null {
  if (!sel) return null;
  if (sel.kind === "step")
    return doc.steps.some((s) => s.id === sel.id) ? sel : null;
  if (sel.kind === "group")
    return doc.groups?.some((g) => g.id === sel.id) ? sel : null;
  const ref = sel.ref;
  if (ref.type === "flow")
    return doc.steps.find((s) => s.id === ref.from)?.then ? sel : null;
  if (ref.type === "branch")
    return (doc.steps.find((s) => s.id === ref.from)?.branches?.length ?? 0) >
      ref.index
      ? sel
      : null;
  return (doc.loops?.length ?? 0) > ref.index ? sel : null;
}

export function Editor({ initial, initialCustom }: Props) {
  const [doc, setDocState] = useState<Explanation>(() => normalize(initial));
  const [isCustom, setIsCustom] = useState(initialCustom);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<Explanation[]>([]);
  const future = useRef<Explanation[]>([]);
  const lastCommit = useRef({ key: "", at: 0 });

  const commit = useCallback(
    (next: Explanation, coalesceKey?: string, stabilize = true) => {
      if (stabilize)
        next = stabilizeGroupMembers(next, layoutPositions(docRef.current));
      const now = Date.now();
      const merge =
        !!coalesceKey &&
        coalesceKey === lastCommit.current.key &&
        now - lastCommit.current.at < COALESCE_MS;
      if (!merge) {
        past.current.push(docRef.current);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }
      lastCommit.current = { key: coalesceKey ?? "", at: now };
      future.current = [];
      setCanUndo(true);
      setDocState(next);
      setIsCustom(true);
      persist(next);
    },
    []
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(past.current.length > 0);
    setDocState(prev);
    setIsCustom(true);
    persist(prev);
    setSelection((s) => validSelection(prev, s));
    setConnectFrom(null);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(true);
    setDocState(next);
    setIsCustom(true);
    persist(next);
    setSelection((s) => validSelection(next, s));
    setConnectFrom(null);
  }, []);

  const positions = useMemo(() => layoutPositions(doc), [doc]);

  /* ------------------------------------------------------- mutations */

  const updateStep = useCallback(
    (id: string, patch: Partial<Step>) => {
      const d = docRef.current;
      commit(
        {
          ...d,
          steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        },
        `step:${id}:${Object.keys(patch).sort().join(",")}`
      );
    },
    [commit]
  );

  const deleteStep = useCallback(
    (id: string) => {
      const d = docRef.current;
      if (d.steps.length <= 1) return;
      const dying = d.steps.find((s) => s.id === id);
      const heal = dying?.then && dying.then !== id ? dying.then : undefined;
      commit({
        ...d,
        steps: d.steps
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            then: s.then === id ? heal : s.then,
            branches: s.branches
              ?.map((b) => (b.to === id && heal ? { ...b, to: heal } : b))
              .filter((b) => b.to !== id),
          })),
        loops: d.loops?.filter((l) => l.from !== id && l.to !== id),
        groups: d.groups
          ?.map((g) => ({ ...g, steps: g.steps.filter((s) => s !== id) }))
          .filter((g) => g.steps.length > 0 || g.grid),
      });
      setSelection(null);
    },
    [commit]
  );

  const addStep = useCallback(
    (opts?: { afterId?: string; cell?: Pos }) => {
      const d = docRef.current;
      let n = d.steps.length + 1;
      while (d.steps.some((s) => s.id === `step-${n}`)) n++;
      const id = `step-${n}`;

      const afterId =
        opts?.afterId ??
        (opts?.cell ? null : selection?.kind === "step" ? selection.id : null);
      let cell: Pos;
      if (opts?.cell) {
        cell = nearestFreeCell(positions, opts.cell.col, opts.cell.row);
      } else {
        const anchor = afterId
          ? positions.get(afterId)
          : [...positions.values()].reduce<Pos | null>(
              (acc, p) => (!acc || p.row > acc.row ? p : acc),
              null
            );
        cell = nearestFreeCell(
          positions,
          anchor?.col ?? 0,
          (anchor?.row ?? -1) + 1
        );
      }

      const newStep: Step = { id, title: "New step", kind: "process", grid: cell };
      let steps: Step[];
      if (afterId) {
        // insert into the flow after the anchor step
        const i = d.steps.findIndex((s) => s.id === afterId);
        const sel = d.steps[i];
        const inherited = !sel.branches?.length ? sel.then : undefined;
        steps = [...d.steps];
        steps[i] = inherited ? { ...sel, then: id } : sel;
        steps.splice(
          i + 1,
          0,
          inherited ? { ...newStep, then: inherited } : newStep
        );
      } else {
        steps = [...d.steps, newStep];
      }
      // a step born inside a region belongs to it
      const home = (d.groups ?? []).find((g) => {
        const rect = groupCellRect(g, positions);
        return rect && cellInRect(rect, cell);
      });
      const groups = home
        ? d.groups?.map((g) =>
            g.id === home.id ? { ...g, steps: [...g.steps, id] } : g
          )
        : d.groups;
      commit({ ...d, steps, groups });
      setSelection({ kind: "step", id });
    },
    [commit, selection, positions]
  );

  const moveNode = useCallback(
    (id: string, cell: Pos) => {
      const d = docRef.current;
      const pos = layoutPositions(d);
      const oldCell = pos.get(id);
      const containing = (c: Pos | undefined) =>
        c
          ? (d.groups ?? []).find((g) => {
              const rect = groupCellRect(g, pos);
              return rect && cellInRect(rect, c);
            })
          : undefined;
      // membership changes only when the drag CROSSES a region boundary,
      // so manual assignments made in the inspector stick
      const newG = containing(cell);
      const oldG = containing(oldCell);
      let groups = d.groups;
      if (newG?.id !== oldG?.id) {
        const next = (d.groups ?? [])
          .map((g) => {
            const isMember = g.steps.includes(id);
            let steps = g.steps;
            if (isMember && g.id !== newG?.id)
              steps = steps.filter((s) => s !== id);
            else if (!isMember && g.id === newG?.id) steps = [...steps, id];
            if (steps === g.steps) return g;
            // a group losing its last member keeps its footprint as a region
            if (steps.length === 0 && !g.grid) {
              const rect = groupCellRect(g, pos);
              return {
                ...g,
                steps,
                grid: rect ? rectToGrid(rect) : undefined,
              };
            }
            return { ...g, steps };
          })
          .filter((g) => g.steps.length > 0 || g.grid);
        groups = next.length ? next : undefined;
      }
      commit(
        {
          ...d,
          steps: d.steps.map((s) =>
            s.id === id ? { ...s, grid: cell } : s
          ),
          groups,
        },
        `step:${id}:grid`
      );
    },
    [commit]
  );

  const moveGroup = useCallback(
    (id: string, dCol: number, dRow: number, mode: "all" | "region") => {
      const d = docRef.current;
      const g = d.groups?.find((x) => x.id === id);
      if (!g || (!dCol && !dRow)) return;
      const pos = layoutPositions(d);

      const inOtherGroup = (sid: string) =>
        (d.groups ?? []).some((x) => x.id !== id && x.steps.includes(sid));
      const otherRects = (d.groups ?? [])
        .filter((x) => x.id !== id)
        .map((x) => groupCellRect(x, pos))
        .filter((r): r is CellRect => !!r);

      if (mode === "region") {
        // move only the box; membership re-derives from the new footprint
        const rect = groupCellRect(g, pos);
        if (!rect) return;
        const base = g.grid ?? rectToGrid(rect);
        const ng = { ...base, col: base.col + dCol, row: base.row + dRow };
        if (
          ng.col < GRID_LIMITS.minCol ||
          ng.col + ng.cols - 1 > GRID_LIMITS.maxCol ||
          ng.row < GRID_LIMITS.minRow ||
          ng.row + ng.rows - 1 > GRID_LIMITS.maxRow
        )
          return;
        const ngRect = {
          minC: ng.col,
          maxC: ng.col + ng.cols - 1,
          minR: ng.row,
          maxR: ng.row + ng.rows - 1,
        };
        if (otherRects.some((o) => rectsOverlap(ngRect, o))) return;
        const inside = (p: Pos) =>
          p.col >= ng.col &&
          p.col <= ng.col + ng.cols - 1 &&
          p.row >= ng.row &&
          p.row <= ng.row + ng.rows - 1;
        // covered tiles belong, unless they belong to another group
        const steps = d.steps
          .filter((s) => {
            const p = pos.get(s.id);
            if (!p || !inside(p)) return false;
            return g.steps.includes(s.id) || !inOtherGroup(s.id);
          })
          .map((s) => s.id);
        commit({
          ...d,
          groups: d.groups?.map((x) =>
            x.id === id ? { ...x, grid: ng, steps } : x
          ),
        });
        return;
      }

      // moving the group takes everything visually inside the box —
      // stray non-members sitting in the region are adopted
      const members = new Set(g.steps);
      const rect = groupCellRect(g, pos);
      if (rect) {
        const shifted = {
          minC: rect.minC + dCol,
          maxC: rect.maxC + dCol,
          minR: rect.minR + dRow,
          maxR: rect.maxR + dRow,
        };
        if (otherRects.some((o) => rectsOverlap(shifted, o))) return;
      }
      if (rect) {
        for (const s of d.steps) {
          if (members.has(s.id) || inOtherGroup(s.id)) continue;
          const p = pos.get(s.id);
          if (p && cellInRect(rect, p)) members.add(s.id);
        }
      }
      for (const sid of members) {
        const p = pos.get(sid);
        if (!p) continue;
        const c = p.col + dCol;
        const r = p.row + dRow;
        if (
          c < GRID_LIMITS.minCol ||
          c > GRID_LIMITS.maxCol ||
          r < GRID_LIMITS.minRow ||
          r > GRID_LIMITS.maxRow
        )
          return;
        for (const [oid, op] of pos)
          if (!members.has(oid) && op.col === c && op.row === r) return;
      }
      commit({
        ...d,
        steps: d.steps.map((s) => {
          if (!members.has(s.id)) return s;
          const p = pos.get(s.id);
          if (!p) return s;
          return { ...s, grid: { col: p.col + dCol, row: p.row + dRow } };
        }),
        groups: d.groups?.map((x) =>
          x.id === id
            ? {
                ...x,
                steps: [...members],
                grid: x.grid
                  ? {
                      ...x.grid,
                      col: x.grid.col + dCol,
                      row: x.grid.row + dRow,
                    }
                  : undefined,
              }
            : x
        ),
      });
    },
    [commit]
  );

  const resizeGroup = useCallback(
    (id: string, grid: { col: number; row: number; cols: number; rows: number }) => {
      const d = docRef.current;
      const g = d.groups?.find((x) => x.id === id);
      if (!g) return;
      const pos = layoutPositions(d);
      const rect = {
        minC: grid.col,
        maxC: grid.col + grid.cols - 1,
        minR: grid.row,
        maxR: grid.row + grid.rows - 1,
      };
      const inOtherGroup = (sid: string) =>
        (d.groups ?? []).some((x) => x.id !== id && x.steps.includes(sid));
      // regions never overlap — reject a resize that crosses another group
      const eff = groupCellRect({ ...g, grid }, pos);
      const otherRects = (d.groups ?? [])
        .filter((x) => x.id !== id)
        .map((x) => groupCellRect(x, pos))
        .filter((r): r is CellRect => !!r);
      if (eff && otherRects.some((o) => rectsOverlap(eff, o))) return;
      // the resized footprint adopts the tiles it now covers
      const adopted = d.steps
        .filter((s) => {
          if (g.steps.includes(s.id) || inOtherGroup(s.id)) return false;
          const p = pos.get(s.id);
          return p && cellInRect(rect, p);
        })
        .map((s) => s.id);
      commit(
        {
          ...d,
          groups: d.groups?.map((x) =>
            x.id === id
              ? { ...x, grid, steps: [...x.steps, ...adopted] }
              : x
          ),
        },
        `group:${id}:grid`
      );
    },
    [commit]
  );

  const addGroupAt = useCallback(
    (cell: Pos) => {
      const d = docRef.current;
      const existing = d.groups ?? [];
      let n = existing.length + 1;
      while (existing.some((g) => g.id === `group-${n}`)) n++;
      const id = `group-${n}`;
      // place the new region at the nearest spot that overlaps no region
      const pos = layoutPositions(d);
      const others = existing
        .map((g) => groupCellRect(g, pos))
        .filter((r): r is CellRect => !!r);
      const fits = (c: number, r: number) =>
        c >= GRID_LIMITS.minCol &&
        c + 1 <= GRID_LIMITS.maxCol &&
        r >= GRID_LIMITS.minRow &&
        r + 1 <= GRID_LIMITS.maxRow &&
        !others.some((o) =>
          rectsOverlap({ minC: c, maxC: c + 1, minR: r, maxR: r + 1 }, o)
        );
      let spot: Pos | null = fits(cell.col, cell.row) ? cell : null;
      for (let dd = 1; dd <= 20 && !spot; dd++) {
        for (let dr = -dd; dr <= dd && !spot; dr++) {
          for (let dc = -dd; dc <= dd && !spot; dc++) {
            if (Math.abs(dr) + Math.abs(dc) !== dd) continue;
            if (fits(cell.col + dc, cell.row + dr))
              spot = { col: cell.col + dc, row: cell.row + dr };
          }
        }
      }
      if (!spot) return;
      commit({
        ...d,
        groups: [
          ...existing,
          {
            id,
            label: `Group ${n}`,
            steps: [],
            grid: { col: spot.col, row: spot.row, cols: 2, rows: 2 },
          },
        ],
      });
      setSelection({ kind: "group", id });
    },
    [commit]
  );

  const completeConnect = useCallback(
    (to: string) => {
      const from = connectFrom;
      setConnectFrom(null);
      if (!from || from === to) return;
      const d = docRef.current;
      const src = d.steps.find((s) => s.id === from);
      if (!src) return;
      if (src.kind === "decision") {
        if (src.branches?.some((b) => b.to === to)) return;
        const branches = [...(src.branches ?? []), { when: "when…", to }];
        updateStep(from, { branches });
        setSelection({
          kind: "edge",
          ref: { type: "branch", from, index: branches.length - 1 },
        });
      } else if (!src.then) {
        updateStep(from, { then: to });
        setSelection({ kind: "edge", ref: { type: "flow", from } });
      } else if (src.then === to) {
        setSelection({ kind: "edge", ref: { type: "flow", from } });
      } else {
        // the flow edge exists — additional connections become loop entries
        const loops = [...(d.loops ?? []), { from, to }];
        commit({ ...d, loops });
        setSelection({
          kind: "edge",
          ref: { type: "loop", index: loops.length - 1 },
        });
      }
    },
    [connectFrom, updateStep, commit]
  );

  const deleteEdge = useCallback(
    (ref: EdgeRef) => {
      const d = docRef.current;
      if (ref.type === "flow") {
        updateStep(ref.from, { then: undefined });
      } else if (ref.type === "branch") {
        const src = d.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).filter((_, i) => i !== ref.index);
        updateStep(ref.from, {
          branches: branches.length ? branches : undefined,
        });
      } else {
        commit({ ...d, loops: d.loops?.filter((_, i) => i !== ref.index) });
      }
      setSelection(null);
    },
    [updateStep, commit]
  );

  const updateEdgeLabel = useCallback(
    (ref: EdgeRef, label: string) => {
      const d = docRef.current;
      if (ref.type === "branch") {
        const src = d.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).map((b, i) =>
          i === ref.index ? { ...b, when: label } : b
        );
        updateStep(ref.from, { branches });
      } else if (ref.type === "loop") {
        commit(
          {
            ...d,
            loops: d.loops?.map((l, i) =>
              i === ref.index ? { ...l, label: label || undefined } : l
            ),
          },
          `loop-label:${ref.index}`
        );
      } else {
        updateStep(ref.from, { thenLabel: label || undefined });
      }
    },
    [updateStep, commit]
  );

  const updateEdgeStyle = useCallback(
    (ref: EdgeRef, patch: { color?: string | null; line?: EdgeLine | null }) => {
      const d = docRef.current;
      const color =
        patch.color === undefined ? undefined : (patch.color ?? undefined);
      const line =
        patch.line === undefined ? undefined : (patch.line ?? undefined);
      const apply = <T extends { color?: string; line?: EdgeLine }>(o: T): T => ({
        ...o,
        ...("color" in patch ? { color } : {}),
        ...("line" in patch ? { line } : {}),
      });
      if (ref.type === "branch") {
        const src = d.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).map((b, i) =>
          i === ref.index ? apply(b) : b
        );
        updateStep(ref.from, { branches });
      } else if (ref.type === "loop") {
        commit(
          {
            ...d,
            loops: d.loops?.map((l, i) => (i === ref.index ? apply(l) : l)),
          },
          `loop-style:${ref.index}`
        );
      } else {
        updateStep(ref.from, {
          ...("color" in patch ? { thenColor: color } : {}),
          ...("line" in patch ? { thenLine: line } : {}),
        });
      }
    },
    [updateStep, commit]
  );

  const tidy = useCallback(() => {
    const d = docRef.current;
    // rule 5: Tidy is the explicit re-layout — skip member stabilization
    const next = tidyLayout(d);
    if (JSON.stringify(next) !== JSON.stringify(d))
      commit(next, undefined, false);
    setFitSignal((s) => s + 1);
  }, [commit]);

  const reset = useCallback(() => {
    past.current.push(docRef.current);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(true);
    setDocState(normalize(SAMPLE));
    setIsCustom(false);
    persist(null);
    setSelection(null);
    setConnectFrom(null);
    setFitSignal((s) => s + 1);
  }, []);

  const actions: EditorActions = useMemo(
    () => ({
      updateDoc: (patch) =>
        commit(
          { ...docRef.current, ...patch },
          `doc:${Object.keys(patch).sort().join(",")}`
        ),
      updateStep,
      deleteStep,
      startConnect: (id) => setConnectFrom(id),
      deleteEdge,
      updateEdgeLabel,
      updateEdgeStyle,
      addPart: (name) => {
        const d = docRef.current;
        const base =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "part";
        let id = base;
        let n = 2;
        while ((d.parts ?? []).some((p) => p.id === id)) id = `${base}-${n++}`;
        commit({ ...d, parts: [...(d.parts ?? []), { id, name }] });
      },
      updatePart: (id, patch) => {
        const d = docRef.current;
        commit(
          {
            ...d,
            parts: d.parts?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          },
          `part:${id}:${Object.keys(patch).sort().join(",")}`
        );
      },
      deletePart: (id) => {
        const d = docRef.current;
        commit({
          ...d,
          parts: d.parts?.filter((p) => p.id !== id),
          steps: d.steps.map((s) =>
            s.part === id ? { ...s, part: undefined } : s
          ),
        });
      },
      assignGroup: (stepId, groupId) => {
        const d = docRef.current;
        const pos = layoutPositions(d);
        let groups = (d.groups ?? []).map((g) => {
          if (!g.steps.includes(stepId)) return g;
          const steps = g.steps.filter((s) => s !== stepId);
          // keep the region when the last member is removed by hand
          if (steps.length === 0 && !g.grid && g.id !== groupId) {
            const rect = groupCellRect(g, pos);
            return { ...g, steps, grid: rect ? rectToGrid(rect) : undefined };
          }
          return { ...g, steps };
        });
        if (groupId === "__new__") {
          let n = groups.length + 1;
          while (groups.some((g) => g.id === `group-${n}`)) n++;
          groups.push({ id: `group-${n}`, label: `Group ${n}`, steps: [stepId] });
        } else if (groupId) {
          groups = groups.map((g) =>
            g.id === groupId ? { ...g, steps: [...g.steps, stepId] } : g
          );
        }
        const kept = groups.filter((g) => g.steps.length > 0 || g.grid);
        commit({ ...d, groups: kept.length ? kept : undefined });
      },
      updateGroup: (id, patch) => {
        const d = docRef.current;
        commit(
          {
            ...d,
            groups: d.groups?.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          },
          `group:${id}:${Object.keys(patch).sort().join(",")}`
        );
      },
      deleteGroup: (id) => {
        const d = docRef.current;
        const groups = d.groups?.filter((g) => g.id !== id);
        commit({ ...d, groups: groups?.length ? groups : undefined });
      },
    }),
    [commit, updateStep, deleteStep, deleteEdge, updateEdgeLabel, updateEdgeStyle]
  );

  /* -------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // undo/redo work everywhere, including inside inputs — all input
      // values are doc state, so this is the only undo that makes sense
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === "function" &&
        target.closest("input, textarea, select")
      )
        return;
      if (e.key === "Escape") {
        if (connectFrom) setConnectFrom(null);
        else setSelection(null);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selection &&
        !jsonOpen
      ) {
        e.preventDefault();
        if (selection.kind === "step") deleteStep(selection.id);
        else if (selection.kind === "group") actions.deleteGroup(selection.id);
        else deleteEdge(selection.ref);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, connectFrom, jsonOpen, deleteStep, deleteEdge, undo, redo, actions]);

  /* ---------------------------------------------------------- render */

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <Toolbar
        title={doc.title}
        isCustom={isCustom}
        canUndo={canUndo}
        onUndo={undo}
        onTidy={tidy}
        onTitle={(title) => commit({ ...doc, title }, "doc:title")}
        onAddStep={() => addStep()}
        onOpenJson={() => setJsonOpen(true)}
        onReset={reset}
      />
      <div className="relative min-h-0 flex-1">
        <Canvas
          doc={doc}
          positions={positions}
          selection={selection}
          connectFrom={connectFrom}
          fitSignal={fitSignal}
          onSelect={setSelection}
          onClearSelection={() => setSelection(null)}
          onMoveNode={moveNode}
          onMoveGroup={moveGroup}
          onResizeGroup={resizeGroup}
          onStartConnect={setConnectFrom}
          onCompleteConnect={completeConnect}
          onCancelConnect={() => setConnectFrom(null)}
          onMenu={(target, x, y) => setMenu({ target, x, y })}
        />
        <Inspector doc={doc} selection={selection} actions={actions} />
        {menu && (
          <ContextMenu
            menu={menu}
            currentColor={
              menu.target.type === "tile"
                ? doc.steps.find(
                    (s) => s.id === (menu.target as { id: string }).id
                  )?.color
                : menu.target.type === "group"
                  ? (doc.groups?.find(
                      (g) => g.id === (menu.target as { id: string }).id
                    )?.color ?? "#9b9bff")
                  : undefined
            }
            canDelete={doc.steps.length > 1}
            onClose={() => setMenu(null)}
            onAddAfter={(id) => addStep({ afterId: id })}
            onAddAt={(cell) => addStep({ cell })}
            onAddGroupAt={addGroupAt}
            onConnect={(id) => setConnectFrom(id)}
            onColor={(id, color) => updateStep(id, { color })}
            onGroupColor={(id, color) => actions.updateGroup(id, { color })}
            onUngroup={(id) => actions.deleteGroup(id)}
            onDeleteStep={deleteStep}
            onDeleteEdge={deleteEdge}
          />
        )}
      </div>
      <JsonDialog
        open={jsonOpen}
        doc={doc}
        onClose={() => setJsonOpen(false)}
        onApply={(data) => {
          // imported docs keep their own layout semantics — no stabilization,
          // but overlapping imported groups are separated up front
          commit(resolveGroupConflicts(normalize(data)), undefined, false);
          setSelection(null);
          setConnectFrom(null);
          setJsonOpen(false);
          setFitSignal((s) => s + 1);
        }}
      />
    </div>
  );
}
