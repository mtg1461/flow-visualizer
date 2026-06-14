"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdgeLine, Explanation, FlowFile, FlowView, Step } from "@/lib/types";
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
  tidyLayout,
  type CellRect,
} from "@/lib/graph";
import { Canvas } from "./Canvas";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { Inspector, type EditorActions } from "./Inspector";
import { Toolbar } from "./Toolbar";
import { ConnectionScreen } from "./ConnectionScreen";
import { DisconnectDialog } from "./DisconnectDialog";
import { AgentPromptDialog } from "./AgentPromptDialog";
import { HowItWorksDialog } from "./HowItWorksDialog";
import { useEditorHistory } from "@/hooks/useEditorHistory";
import { useFileConnection } from "@/hooks/useFileConnection";
import { LOCAL_FILES_ENABLED } from "@/lib/config";

interface Props {
  initial: FlowFile;
}

/**
 * Groups anchor their members. A tile inside a group must never move because
 * something outside that group changed. Explicit re-layout and file-load
 * operations opt out by calling commit with stabilization disabled.
 */
function stabilizeGroupMembers(
  next: FlowView,
  prevPos: Map<string, Pos>
): FlowView {
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

export function Editor({ initial }: Props) {
  const [activeViewId, setActiveViewId] = useState(
    () => initial.views[0]?.id ?? "main"
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [agentPromptOpen, setAgentPromptOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const activeViewIdRef = useRef(activeViewId);
  activeViewIdRef.current = activeViewId;

  const onRestore = useCallback((restored: FlowFile) => {
    const restoredView =
      restored.views.find((view) => view.id === activeViewIdRef.current) ??
      restored.views[0];
    if (!restoredView) return;
    if (restoredView.id !== activeViewIdRef.current)
      setActiveViewId(restoredView.id);
    setSelection((s) => validSelection(restoredView, s));
    setConnectFrom(null);
  }, []);

  const { doc: fileDoc, docRef: fileRef, commit: commitFile, undo, redo, canUndo } = useEditorHistory<FlowFile>({
    initial: { views: initial.views.map((view) => normalize(view)) },
    onRestore,
  });

  const activeView =
    fileDoc.views.find((view) => view.id === activeViewId) ?? fileDoc.views[0]!;
  const doc = activeView;
  const docRef = useRef(doc);
  docRef.current = doc;

  const commit = useCallback(
    (next: Explanation, coalesceKey?: string, shouldStabilize = true) => {
      const currentFile = fileRef.current;
      const viewId = activeViewIdRef.current;
      const currentView =
        currentFile.views.find((view) => view.id === viewId) ??
        currentFile.views[0];
      if (!currentView) return;
      const nextViewBase = { ...next, id: currentView.id } as FlowView;
      const nextView = shouldStabilize
        ? stabilizeGroupMembers(nextViewBase, layoutPositions(currentView))
        : nextViewBase;
      commitFile(
        {
          ...currentFile,
          views: currentFile.views.map((view) =>
            view.id === currentView.id ? nextView : view
          ),
        },
        coalesceKey,
        false
      );
    },
    [commitFile, fileRef]
  );

  const onFileConnected = useCallback((viewId: string) => {
    setActiveViewId(viewId);
    setSelection(null);
    setConnectFrom(null);
    setMenu(null);
    setFitSignal((s) => s + 1);
  }, []);

  const onFileDisconnected = useCallback(() => {
    setSelection(null);
    setConnectFrom(null);
    setMenu(null);
    setDisconnectOpen(false);
  }, []);

  const fileConnection = useFileConnection({
    file: fileDoc,
    activeViewId,
    commit: commitFile,
    onConnected: onFileConnected,
    onDisconnected: onFileDisconnected,
  });

  const positions = useMemo(() => layoutPositions(doc), [doc]);
  const viewOptions = useMemo(
    () =>
      fileDoc.views.map((view) => ({
        id: view.id,
        title: view.title,
        summary: view.summary,
        stepCount: view.steps.length,
      })),
    [fileDoc.views]
  );

  const switchView = useCallback((id: string) => {
    if (id === activeViewIdRef.current) return;
    setActiveViewId(id);
    setSelection(null);
    setConnectFrom(null);
    setMenu(null);
    setFitSignal((s) => s + 1);
  }, []);

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
      // so nudging a tile within its own group never toggles it
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

  const addGroupFromToolbar = useCallback(() => {
    const d = docRef.current;
    const pos = layoutPositions(d);
    const existing = d.groups ?? [];
    const otherRects = existing
      .map((g) => groupCellRect(g, pos))
      .filter((r): r is CellRect => !!r);

    if (selection?.kind === "step") {
      const stepCell = pos.get(selection.id);
      const alreadyGrouped = existing.some((g) => g.steps.includes(selection.id));
      if (stepCell && !alreadyGrouped) {
        let n = existing.length + 1;
        while (existing.some((g) => g.id === `group-${n}`)) n++;
        const id = `group-${n}`;
        const candidate = { id, label: `Group ${n}`, steps: [selection.id] };
        const rect = groupCellRect(candidate, pos);
        if (rect && !otherRects.some((o) => rectsOverlap(rect, o))) {
          commit({ ...d, groups: [...existing, candidate] });
          setSelection({ kind: "group", id });
          return;
        }
      }
    }

    if (selection?.kind === "group") {
      const group = existing.find((g) => g.id === selection.id);
      const rect = group ? groupCellRect(group, pos) : null;
      if (rect) {
        addGroupAt({
          col: Math.min(GRID_LIMITS.maxCol - 1, rect.maxC + 1),
          row: Math.min(GRID_LIMITS.maxRow - 1, rect.minR),
        });
        return;
      }
    }

    if (selection?.kind === "step") {
      const stepCell = pos.get(selection.id);
      if (stepCell) {
        addGroupAt({
          col: Math.min(GRID_LIMITS.maxCol - 1, stepCell.col + 1),
          row: Math.min(GRID_LIMITS.maxRow - 1, stepCell.row),
        });
        return;
      }
    }

    const cells = [...pos.values()];
    const minCol = cells.reduce(
      (acc, cell) => Math.min(acc, cell.col),
      cells[0]?.col ?? 0
    );
    const maxRow = cells.reduce(
      (acc, cell) => Math.max(acc, cell.row),
      cells[0]?.row ?? 0
    );
    addGroupAt({
      col: Math.min(GRID_LIMITS.maxCol - 1, minCol),
      row: Math.min(GRID_LIMITS.maxRow - 1, maxRow + 1),
    });
  }, [addGroupAt, commit, selection]);

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
      addActor: (name) => {
        const d = docRef.current;
        const base =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "actor";
        let id = base;
        let n = 2;
        while ((d.actors ?? []).some((p) => p.id === id)) id = `${base}-${n++}`;
        commit({ ...d, actors: [...(d.actors ?? []), { id, name }] });
      },
      updateActor: (id, patch) => {
        const d = docRef.current;
        commit(
          {
            ...d,
            actors: d.actors?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          },
          `actor:${id}:${Object.keys(patch).sort().join(",")}`
        );
      },
      deleteActor: (id) => {
        const d = docRef.current;
        commit({
          ...d,
          actors: d.actors?.filter((p) => p.id !== id),
          steps: d.steps.map((s) =>
            s.actor === id ? { ...s, actor: undefined } : s
          ),
        });
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
      // undo/redo work everywhere, including form fields — their values
      // are doc state, so this is the only undo that makes sense
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
        !disconnectOpen
      ) {
        e.preventDefault();
        if (selection.kind === "step") deleteStep(selection.id);
        else if (selection.kind === "group") actions.deleteGroup(selection.id);
        else deleteEdge(selection.ref);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, connectFrom, disconnectOpen, deleteStep, deleteEdge, undo, redo, actions]);

  /* ---------------------------------------------------------- render */

  if (!fileConnection.connected) {
    return (
      <>
        <ConnectionScreen
          status={fileConnection.status}
          error={fileConnection.error}
          preview={fileConnection.preview}
          allowLocalPath={LOCAL_FILES_ENABLED}
          onConnectPreview={fileConnection.connectPending}
          onClearPreview={fileConnection.clearPreview}
          onBrowse={fileConnection.browseFile}
          onCreateEmpty={fileConnection.createEmpty}
          onDropConnection={fileConnection.connectDropped}
          onSeeExample={fileConnection.loadExample}
          onHowItWorks={() => setHowItWorksOpen(true)}
          onAgentPrompt={() => setAgentPromptOpen(true)}
        />
        <HowItWorksDialog
          open={howItWorksOpen}
          onClose={() => setHowItWorksOpen(false)}
          onOpenAgentPrompt={() => {
            setHowItWorksOpen(false);
            setAgentPromptOpen(true);
          }}
        />
        <AgentPromptDialog
          open={agentPromptOpen}
          onClose={() => setAgentPromptOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <Toolbar
        views={viewOptions}
        activeViewId={activeViewId}
        connectionName={fileConnection.connectionName}
        status={fileConnection.status}
        canUndo={canUndo}
        onUndo={undo}
        onAddStep={() => addStep()}
        onAddGroup={addGroupFromToolbar}
        onViewSelect={switchView}
        onTidy={tidy}
        onAgentPrompt={() => setAgentPromptOpen(true)}
        onDisconnect={() => setDisconnectOpen(true)}
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
      <DisconnectDialog
        open={disconnectOpen}
        connectionName={fileConnection.connectionName}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={fileConnection.disconnect}
      />
      <AgentPromptDialog
        open={agentPromptOpen}
        onClose={() => setAgentPromptOpen(false)}
      />
    </div>
  );
}
