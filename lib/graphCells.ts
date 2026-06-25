import type { Group } from "./types";
import type { CellRect, Pos } from "./graphTypes";

/** A group's footprint in cells: its members' bbox plus any explicit region. */
export function groupCellRect(
  g: Group,
  pos: Map<string, Pos>
): CellRect | null {
  let minC = Infinity;
  let maxC = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const id of g.steps) {
    const p = pos.get(id);
    if (!p) continue;
    minC = Math.min(minC, p.col);
    maxC = Math.max(maxC, p.col);
    minR = Math.min(minR, p.row);
    maxR = Math.max(maxR, p.row);
  }
  if (g.grid) {
    minC = Math.min(minC, g.grid.col);
    maxC = Math.max(maxC, g.grid.col + g.grid.cols - 1);
    minR = Math.min(minR, g.grid.row);
    maxR = Math.max(maxR, g.grid.row + g.grid.rows - 1);
  }
  if (!Number.isFinite(minC)) return null;
  return { minC, maxC, minR, maxR };
}

/** A group's member-only footprint, ignoring any explicit region. */
export function groupMemberCellRect(
  g: Group,
  pos: Map<string, Pos>
): CellRect | null {
  let minC = Infinity;
  let maxC = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const id of g.steps) {
    const p = pos.get(id);
    if (!p) continue;
    minC = Math.min(minC, p.col);
    maxC = Math.max(maxC, p.col);
    minR = Math.min(minR, p.row);
    maxR = Math.max(maxR, p.row);
  }
  if (!Number.isFinite(minC)) return null;
  return { minC, maxC, minR, maxR };
}

export function rectToGrid(rect: CellRect) {
  return {
    col: rect.minC,
    row: rect.minR,
    cols: rect.maxC - rect.minC + 1,
    rows: rect.maxR - rect.minR + 1,
  };
}

export function rectsOverlap(a: CellRect, b: CellRect): boolean {
  return (
    a.minC <= b.maxC && b.minC <= a.maxC && a.minR <= b.maxR && b.minR <= a.maxR
  );
}

export function cellInRect(rect: CellRect, cell: Pos): boolean {
  return (
    cell.col >= rect.minC &&
    cell.col <= rect.maxC &&
    cell.row >= rect.minR &&
    cell.row <= rect.maxR
  );
}
