import type { EdgeLine } from "./types";

/** Tile geometry -- node tiles sit centered in grid cells. */
export const CELL_W = 320;
export const CELL_H = 168;
export const NODE_W = 256;
export const NODE_H = 96;
export const GX = (CELL_W - NODE_W) / 2;
export const GY = (CELL_H - NODE_H) / 2;

export interface Pos {
  col: number;
  row: number;
}

/** The canvas extends in every direction, but not forever. The slot
 *  lattice renders exactly this range, so the visible grid is the limit. */
export const GRID_LIMITS = {
  minCol: -12,
  maxCol: 60,
  minRow: -24,
  maxRow: 120,
};

export function clampCol(c: number) {
  return Math.min(GRID_LIMITS.maxCol, Math.max(GRID_LIMITS.minCol, c));
}

export function clampRow(r: number) {
  return Math.min(GRID_LIMITS.maxRow, Math.max(GRID_LIMITS.minRow, r));
}

export type EdgeRef =
  | { type: "flow"; from: string }
  | { type: "branch"; from: string; index: number }
  | { type: "loop"; index: number };

export interface CellRect {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

export interface EdgeDesc {
  ref: EdgeRef;
  key: string;
  from: string;
  to: string;
  label?: string;
  /** Points to an earlier step in narrative order -- rendered as feedback. */
  backward: boolean;
  kind: "flow" | "branch" | "loop";
  /** Custom color override. */
  color?: string;
  /** Custom line-style override. */
  line?: EdgeLine;
}

export interface RoutedEdge extends EdgeDesc {
  d: string;
  labelX: number;
  labelY: number;
}
