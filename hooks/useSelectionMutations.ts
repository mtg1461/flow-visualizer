"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Explanation } from "@/lib/types";
import {
  GRID_LIMITS,
  type CellRect,
  type EdgeRef,
  type Pos,
  groupCellRect,
  layoutPositions,
  nearestFreeCell,
  rectsOverlap,
  tidyPreservingLayout,
} from "@/lib/graph";
import {
  normalizeSelection,
  selectionItems,
  type MultiSelectionItem,
  type Selection,
} from "@/lib/selection";

type CommitView = (
  next: Explanation,
  coalesceKey?: string,
  shouldStabilize?: boolean
) => void;

interface Options {
  docRef: MutableRefObject<Explanation>;
  selection: Selection | null;
  setSelection: Dispatch<SetStateAction<Selection | null>>;
  commit: CommitView;
  focusCell: (cell: Pos) => void;
  deleteStep: (id: string) => void;
  deleteEdge: (ref: EdgeRef) => void;
}

function rectToGrid(rect: CellRect) {
  return {
    col: rect.minC,
    row: rect.minR,
    cols: rect.maxC - rect.minC + 1,
    rows: rect.maxR - rect.minR + 1,
  };
}

function uniqueId(base: string, used: Set<string>) {
  let clean = base.replace(/-copy(?:-\d+)?$/, "");
  if (!clean) clean = "item";
  let id = `${clean}-copy`;
  let n = 2;
  while (used.has(id)) id = `${clean}-copy-${n++}`;
  used.add(id);
  return id;
}

function selectedStepIdsFromItems(doc: Explanation, items: MultiSelectionItem[]) {
  const ids = new Set(
    items.filter((item) => item.kind === "step").map((item) => item.id)
  );
  const groupIds = new Set(
    items.filter((item) => item.kind === "group").map((item) => item.id)
  );
  for (const group of doc.groups ?? []) {
    if (!groupIds.has(group.id)) continue;
    for (const id of group.steps) ids.add(id);
  }
  return ids;
}

export function useSelectionMutations({
  docRef,
  selection,
  setSelection,
  commit,
  focusCell,
  deleteStep,
  deleteEdge,
}: Options) {
  const moveSelection = useCallback(
    (items: MultiSelectionItem[], dCol: number, dRow: number) => {
      if (!dCol && !dRow) return;
      const d = docRef.current;
      const pos = layoutPositions(d);
      const groupIds = new Set(
        items.filter((item) => item.kind === "group").map((item) => item.id)
      );
      const carried = new Set(
        items.filter((item) => item.kind === "step").map((item) => item.id)
      );

      for (const group of d.groups ?? []) {
        if (!groupIds.has(group.id)) continue;
        for (const id of group.steps) carried.add(id);
      }
      if (carried.size === 0 && groupIds.size === 0) return;

      for (const sid of carried) {
        const p = pos.get(sid);
        if (!p) continue;
        const col = p.col + dCol;
        const row = p.row + dRow;
        if (
          col < GRID_LIMITS.minCol ||
          col > GRID_LIMITS.maxCol ||
          row < GRID_LIMITS.minRow ||
          row > GRID_LIMITS.maxRow
        )
          return;
        for (const [oid, op] of pos)
          if (!carried.has(oid) && op.col === col && op.row === row) return;
      }

      const otherRects = (d.groups ?? [])
        .filter((group) => !groupIds.has(group.id))
        .map((group) => groupCellRect(group, pos))
        .filter((rect): rect is CellRect => !!rect);
      for (const group of d.groups ?? []) {
        if (!groupIds.has(group.id)) continue;
        const rect = groupCellRect(group, pos);
        if (!rect) continue;
        const shifted = {
          minC: rect.minC + dCol,
          maxC: rect.maxC + dCol,
          minR: rect.minR + dRow,
          maxR: rect.maxR + dRow,
        };
        if (
          shifted.minC < GRID_LIMITS.minCol ||
          shifted.maxC > GRID_LIMITS.maxCol ||
          shifted.minR < GRID_LIMITS.minRow ||
          shifted.maxR > GRID_LIMITS.maxRow ||
          otherRects.some((other) => rectsOverlap(shifted, other))
        )
          return;
      }

      commit({
        ...d,
        steps: d.steps.map((step) => {
          if (!carried.has(step.id)) return step;
          const p = pos.get(step.id);
          if (!p) return step;
          return { ...step, grid: { col: p.col + dCol, row: p.row + dRow } };
        }),
        groups: d.groups?.map((group) =>
          groupIds.has(group.id) && group.grid
            ? {
                ...group,
                grid: {
                  ...group.grid,
                  col: group.grid.col + dCol,
                  row: group.grid.row + dRow,
                },
              }
            : group
        ),
      });
    },
    [commit, docRef]
  );

  const groupSelection = useCallback(() => {
    const items = selectionItems(selection);
    if (items.length === 0) return;
    const d = docRef.current;
    const stepIds = selectedStepIdsFromItems(d, items);
    if (stepIds.size < 2) return;

    const pos = layoutPositions(d);
    const selectedSteps = d.steps.filter((step) => stepIds.has(step.id));
    const cells = selectedSteps
      .map((step) => pos.get(step.id))
      .filter((cell): cell is Pos => !!cell);
    if (cells.length < 2) return;

    const existing = d.groups ?? [];
    let n = existing.length + 1;
    while (existing.some((group) => group.id === `group-${n}`)) n++;
    const id = `group-${n}`;
    const rect = {
      minC: Math.min(...cells.map((cell) => cell.col)),
      maxC: Math.max(...cells.map((cell) => cell.col)),
      minR: Math.min(...cells.map((cell) => cell.row)),
      maxR: Math.max(...cells.map((cell) => cell.row)),
    };

    const groups = [
      ...existing
        .map((group) => ({
          ...group,
          steps: group.steps.filter((stepId) => !stepIds.has(stepId)),
        }))
        .filter((group) => group.steps.length > 0 || group.grid),
      {
        id,
        label: `Group ${n}`,
        steps: selectedSteps.map((step) => step.id),
        grid: rectToGrid(rect),
      },
    ];

    const next = tidyPreservingLayout({ ...d, groups });
    commit(next, undefined, false);
    setSelection({ kind: "group", id });
    focusCell({ col: rect.minC, row: rect.minR });
  }, [commit, docRef, focusCell, selection, setSelection]);

  const duplicateSelection = useCallback(() => {
    const items = selectionItems(selection);
    if (items.length === 0) return;
    const d = docRef.current;
    const pos = layoutPositions(d);
    const selectedGroupIds = new Set(
      items.filter((item) => item.kind === "group").map((item) => item.id)
    );
    const sourceStepIds = selectedStepIdsFromItems(d, items);
    if (sourceStepIds.size === 0 && selectedGroupIds.size === 0) return;

    const sourceSteps = d.steps.filter((step) => sourceStepIds.has(step.id));
    const usedStepIds = new Set(d.steps.map((step) => step.id));
    const idMap = new Map<string, string>();
    for (const step of sourceSteps) {
      idMap.set(step.id, uniqueId(step.id, usedStepIds));
    }

    const occupied = new Map<string, string>();
    for (const [id, cell] of pos) {
      if (!sourceStepIds.has(id)) occupied.set(`${cell.col},${cell.row}`, id);
    }

    const selectedRects = (d.groups ?? [])
      .filter((group) => selectedGroupIds.has(group.id))
      .map((group) => groupCellRect(group, pos))
      .filter((rect): rect is CellRect => !!rect);
    const otherRects = (d.groups ?? [])
      .filter((group) => !selectedGroupIds.has(group.id))
      .map((group) => groupCellRect(group, pos))
      .filter((rect): rect is CellRect => !!rect);

    const fitsOffset = (dCol: number, dRow: number) => {
      const seen = new Set<string>();
      for (const step of sourceSteps) {
        const p = pos.get(step.id);
        if (!p) continue;
        const col = p.col + dCol;
        const row = p.row + dRow;
        const key = `${col},${row}`;
        if (
          col < GRID_LIMITS.minCol ||
          col > GRID_LIMITS.maxCol ||
          row < GRID_LIMITS.minRow ||
          row > GRID_LIMITS.maxRow ||
          occupied.has(key) ||
          seen.has(key)
        )
          return false;
        seen.add(key);
      }
      for (const rect of selectedRects) {
        const shifted = {
          minC: rect.minC + dCol,
          maxC: rect.maxC + dCol,
          minR: rect.minR + dRow,
          maxR: rect.maxR + dRow,
        };
        if (
          shifted.minC < GRID_LIMITS.minCol ||
          shifted.maxC > GRID_LIMITS.maxCol ||
          shifted.minR < GRID_LIMITS.minRow ||
          shifted.maxR > GRID_LIMITS.maxRow ||
          otherRects.some((other) => rectsOverlap(shifted, other))
        )
          return false;
      }
      return true;
    };

    let offset: Pos = { col: 1, row: 1 };
    let foundOffset = fitsOffset(offset.col, offset.row);
    for (let distance = 1; distance <= 18 && !foundOffset; distance++) {
      for (let dRow = -distance; dRow <= distance && !foundOffset; dRow++) {
        for (let dCol = -distance; dCol <= distance && !foundOffset; dCol++) {
          if (Math.abs(dCol) + Math.abs(dRow) !== distance) continue;
          if (dCol === 0 && dRow === 0) continue;
          if (fitsOffset(dCol, dRow)) {
            offset = { col: dCol, row: dRow };
            foundOffset = true;
          }
        }
      }
    }

    const newPositions = new Map(pos);
    const clones = sourceSteps.map((step) => {
      const nextId = idMap.get(step.id)!;
      const p = pos.get(step.id);
      const grid =
        foundOffset && p
          ? { col: p.col + offset.col, row: p.row + offset.row }
          : nearestFreeCell(newPositions, (p?.col ?? 0) + 1, (p?.row ?? 0) + 1);
      newPositions.set(nextId, grid);

      const branches = step.branches
        ?.filter((branch) => idMap.has(branch.to))
        .map((branch) => ({ ...branch, to: idMap.get(branch.to)! }));
      const then = step.then && idMap.has(step.then) ? idMap.get(step.then) : undefined;

      return {
        ...step,
        id: nextId,
        title: `${step.title} copy`,
        grid,
        then,
        thenLabel: then ? step.thenLabel : undefined,
        thenColor: then ? step.thenColor : undefined,
        thenLine: then ? step.thenLine : undefined,
        branches: branches?.length ? branches : undefined,
      };
    });

    const usedGroupIds = new Set((d.groups ?? []).map((group) => group.id));
    const copiedGroups = (d.groups ?? [])
      .filter((group) => selectedGroupIds.has(group.id))
      .map((group) => ({
        ...group,
        id: uniqueId(group.id, usedGroupIds),
        label: `${group.label} copy`,
        steps: group.steps
          .map((stepId) => idMap.get(stepId))
          .filter((stepId): stepId is string => !!stepId),
        grid: group.grid
          ? {
              ...group.grid,
              col: group.grid.col + offset.col,
              row: group.grid.row + offset.row,
            }
          : undefined,
      }))
      .filter((group) => group.steps.length > 0 || group.grid);

    const copiedLoops = (d.loops ?? [])
      .filter((loop) => idMap.has(loop.from) && idMap.has(loop.to))
      .map((loop) => ({
        ...loop,
        from: idMap.get(loop.from)!,
        to: idMap.get(loop.to)!,
      }));

    const next = tidyPreservingLayout({
      ...d,
      steps: [...d.steps, ...clones],
      loops: [...(d.loops ?? []), ...copiedLoops],
      groups: [...(d.groups ?? []), ...copiedGroups],
    });
    commit(next, undefined, false);
    setSelection(
      normalizeSelection([
        ...clones.map((step) => ({ kind: "step" as const, id: step.id })),
        ...copiedGroups.map((group) => ({
          kind: "group" as const,
          id: group.id,
        })),
      ])
    );
    const first = clones[0]?.grid ?? copiedGroups[0]?.grid;
    if (first) focusCell({ col: first.col, row: first.row });
  }, [commit, docRef, focusCell, selection, setSelection]);

  const deleteSelection = useCallback(() => {
    const sel = selection;
    if (!sel) return;
    if (sel.kind === "edge") {
      deleteEdge(sel.ref);
      return;
    }
    if (sel.kind === "step") {
      deleteStep(sel.id);
      return;
    }

    const d = docRef.current;
    const items = selectionItems(sel);
    const removedGroups = new Set(
      items.filter((item) => item.kind === "group").map((item) => item.id)
    );
    const removedSteps = new Set(
      items.filter((item) => item.kind === "step").map((item) => item.id)
    );

    if (removedSteps.size >= d.steps.length) {
      const keep = d.steps.find((step) => removedSteps.has(step.id));
      if (keep) removedSteps.delete(keep.id);
    }

    const steps = d.steps
      .filter((step) => !removedSteps.has(step.id))
      .map((step) => {
        const then =
          step.then && removedSteps.has(step.then) ? undefined : step.then;
        const branches = step.branches?.filter(
          (branch) => !removedSteps.has(branch.to)
        );
        return {
          ...step,
          then,
          branches: branches?.length ? branches : undefined,
        };
      });

    const groups = d.groups
      ?.filter((group) => !removedGroups.has(group.id))
      .map((group) => ({
        ...group,
        steps: group.steps.filter((id) => !removedSteps.has(id)),
      }))
      .filter((group) => group.steps.length > 0 || group.grid);

    commit({
      ...d,
      steps,
      loops: d.loops?.filter(
        (loop) => !removedSteps.has(loop.from) && !removedSteps.has(loop.to)
      ),
      groups: groups?.length ? groups : undefined,
    });
    setSelection(null);
  }, [commit, deleteEdge, deleteStep, docRef, selection, setSelection]);

  return {
    deleteSelection,
    duplicateSelection,
    groupSelection,
    moveSelection,
  };
}
