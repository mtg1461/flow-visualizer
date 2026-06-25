import type { EdgeLine, Explanation, Group } from "./types";

/** Tile geometry — node tiles sit centered in grid cells. */
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

function clampCol(c: number) {
  return Math.min(GRID_LIMITS.maxCol, Math.max(GRID_LIMITS.minCol, c));
}

function clampRow(r: number) {
  return Math.min(GRID_LIMITS.maxRow, Math.max(GRID_LIMITS.minRow, r));
}

export type EdgeRef =
  | { type: "flow"; from: string }
  | { type: "branch"; from: string; index: number }
  | { type: "loop"; index: number };

export type Selection =
  | { kind: "step"; id: string }
  | { kind: "edge"; ref: EdgeRef }
  | { kind: "group"; id: string };

export interface CellRect {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

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
function groupMemberCellRect(g: Group, pos: Map<string, Pos>): CellRect | null {
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

function rectToGrid(rect: CellRect) {
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

export function edgeKey(ref: EdgeRef): string {
  if (ref.type === "flow") return `f-${ref.from}`;
  if (ref.type === "branch") return `b-${ref.from}-${ref.index}`;
  return `l-${ref.index}`;
}

export interface EdgeDesc {
  ref: EdgeRef;
  key: string;
  from: string;
  to: string;
  label?: string;
  /** Points to an earlier step in narrative order — rendered as feedback. */
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

/**
 * The agent schema lets flow continue implicitly to the following step.
 * The editor needs every connection explicit, so implicit nexts are
 * materialized into `then` on load and stripped again on export.
 */
export function normalize<T extends Explanation>(doc: T): T {
  const pairKey = (from: string, to: string) => `${from}\u0000${to}`;
  const branchPairs = new Set<string>();
  const flowPairs = new Map<string, number>();
  let changed = false;

  let steps = doc.steps.map((s, i) => {
    const next = doc.steps[i + 1];
    if (!s.branches?.length && !s.then && next) {
      changed = true;
      return { ...s, then: next.id };
    }
    return s;
  });

  steps = steps.map((s, i) => {
    let step = s;
    if (s.branches?.length) {
      const seenTargets = new Set<string>();
      const branches = s.branches.filter((b) => {
        const key = pairKey(s.id, b.to);
        if (seenTargets.has(b.to) || branchPairs.has(key)) {
          changed = true;
          return false;
        }
        seenTargets.add(b.to);
        branchPairs.add(key);
        return true;
      });
      if (branches.length !== s.branches.length) {
        step = { ...step, branches: branches.length ? branches : undefined };
      }
      if (step.then) {
        const {
          then: _then,
          thenLabel: _thenLabel,
          thenColor: _thenColor,
          thenLine: _thenLine,
          ...rest
        } = step;
        step = rest;
        changed = true;
      }
    }

    if (step.then) flowPairs.set(pairKey(step.id, step.then), i);
    return step;
  });

  const loops = doc.loops?.filter((loop) => {
    const key = pairKey(loop.from, loop.to);
    const flowIndex = flowPairs.get(key);
    if (flowIndex !== undefined) {
      if (loop.label && !steps[flowIndex].thenLabel) {
        steps[flowIndex] = { ...steps[flowIndex], thenLabel: loop.label };
      }
      changed = true;
      return false;
    }
    if (branchPairs.has(key)) {
      changed = true;
      return false;
    }
    return true;
  });

  if (loops && doc.loops && loops.length !== doc.loops.length) changed = true;
  return changed ? { ...doc, steps, loops: loops?.length ? loops : undefined } : doc;
}

export function denormalize<T extends Explanation>(doc: T): T {
  const steps = doc.steps.map((s, i) => {
    const next = doc.steps[i + 1];
    if (
      s.then &&
      next &&
      s.then === next.id &&
      !s.branches?.length &&
      !s.thenLabel &&
      !s.thenColor &&
      !s.thenLine
    ) {
      const { then: _omitted, ...rest } = s;
      return rest;
    }
    return s;
  });
  return { ...doc, steps };
}

export function buildEdges(doc: Explanation): EdgeDesc[] {
  const idx = new Map(doc.steps.map((s, i) => [s.id, i]));
  const out: EdgeDesc[] = [];
  for (const s of doc.steps) {
    (s.branches ?? []).forEach((b, bi) => {
      if (!idx.has(b.to)) return;
      out.push({
        ref: { type: "branch", from: s.id, index: bi },
        key: `b-${s.id}-${bi}`,
        from: s.id,
        to: b.to,
        label: b.when,
        backward: idx.get(b.to)! <= idx.get(s.id)!,
        kind: "branch",
        color: b.color,
        line: b.line,
      });
    });
    if (s.then && idx.has(s.then)) {
      out.push({
        ref: { type: "flow", from: s.id },
        key: `f-${s.id}`,
        from: s.id,
        to: s.then,
        label: s.thenLabel,
        backward: idx.get(s.then)! <= idx.get(s.id)!,
        kind: "flow",
        color: s.thenColor,
        line: s.thenLine,
      });
    }
  }
  (doc.loops ?? []).forEach((l, li) => {
    if (!idx.has(l.from) || !idx.has(l.to)) return;
    out.push({
      ref: { type: "loop", index: li },
      key: `l-${li}`,
      from: l.from,
      to: l.to,
      label: l.label,
      backward: true,
      kind: "loop",
      color: l.color,
      line: l.line,
    });
  });
  return out;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function centeredInteger(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

function desiredColumnsByLayer(
  steps: Explanation["steps"],
  preds: Map<string, string[]>,
  succs: Map<string, string[]>,
  rowOf: Map<string, number>,
  pinned: Set<string>
): Map<string, number> {
  const indexOf = new Map(steps.map((s, i) => [s.id, i]));
  const rows = new Map<number, string[]>();

  for (const s of steps) {
    if (pinned.has(s.id)) continue;
    const row = rowOf.get(s.id);
    if (row === undefined) continue;
    const ids = rows.get(row) ?? [];
    ids.push(s.id);
    rows.set(row, ids);
  }

  const rowNumbers = [...rows.keys()].sort((a, b) => a - b);
  if (rowNumbers.length === 0) return new Map();

  for (const ids of rows.values()) {
    ids.sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
  }

  const orderMap = () => {
    const order = new Map<string, number>();
    for (const ids of rows.values()) {
      ids.forEach((id, i) => order.set(id, i));
    }
    return order;
  };

  const neighborAverage = (
    id: string,
    neighbors: string[] | undefined,
    order: Map<string, number>
  ) => {
    const values =
      neighbors
        ?.map((neighbor) => order.get(neighbor))
        .filter((value): value is number => value !== undefined) ?? [];
    return values.length ? average(values) : null;
  };

  const stableSort = (
    ids: string[],
    scoreOf: (id: string) => number | null
  ) => {
    const previous = new Map(ids.map((id, i) => [id, i]));
    ids.sort((a, b) => {
      const av = scoreOf(a);
      const bv = scoreOf(b);
      if (av !== null && bv !== null && av !== bv) return av - bv;
      if (av !== null && bv === null) return -1;
      if (av === null && bv !== null) return 1;
      return (
        (previous.get(a) ?? 0) - (previous.get(b) ?? 0) ||
        (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0)
      );
    });
  };

  for (let pass = 0; pass < 4; pass++) {
    let order = orderMap();
    for (const row of rowNumbers) {
      const ids = rows.get(row);
      if (!ids || ids.length < 2) continue;
      stableSort(ids, (id) => neighborAverage(id, preds.get(id), order));
    }

    order = orderMap();
    for (const row of [...rowNumbers].reverse()) {
      const ids = rows.get(row);
      if (!ids || ids.length < 2) continue;
      stableSort(ids, (id) => neighborAverage(id, succs.get(id), order));
    }
  }

  const desired = new Map<string, number>();
  for (const row of rowNumbers) {
    const ids = rows.get(row) ?? [];
    const start = -Math.floor((ids.length - 1) / 2);
    ids.forEach((id, i) => desired.set(id, start + i));
  }

  // Center branching parents above their child span. Collisions are still
  // resolved by the normal outward scan, so this only expresses preference.
  for (const row of [...rowNumbers].reverse()) {
    for (const id of rows.get(row) ?? []) {
      const childCols =
        succs
          .get(id)
          ?.map((child) => desired.get(child))
          .filter((value): value is number => value !== undefined) ?? [];
      if (childCols.length === 0) continue;
      if (childCols.length > 1 || (preds.get(id)?.length ?? 0) === 0) {
        desired.set(id, centeredInteger(average(childCols)));
      }
    }
  }

  return desired;
}

/**
 * Tile placement. Steps with a manual `grid` keep it; the rest get a
 * layered layout: row = longest forward path, branches fan into
 * neighbouring columns, collisions scan outward for a free cell.
 */
export function layoutPositions(doc: Explanation): Map<string, Pos> {
  const steps = doc.steps;
  const pos = new Map<string, Pos>();
  const occupied = new Set<string>();
  const okey = (c: number, r: number) => `${c},${r}`;

  for (const s of steps) {
    if (s.grid) {
      pos.set(s.id, { col: s.grid.col, row: s.grid.row });
      occupied.add(okey(s.grid.col, s.grid.row));
    }
  }
  const pinned = new Set(pos.keys());

  const fwd = buildEdges(doc).filter((e) => e.kind !== "loop" && !e.backward);
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of fwd) {
    const arr = preds.get(e.to) ?? [];
    arr.push(e.from);
    preds.set(e.to, arr);
    const out = succs.get(e.from) ?? [];
    out.push(e.to);
    succs.set(e.from, out);
  }

  const groupOf = new Map<string, string>();
  for (const g of doc.groups ?? []) {
    for (const sid of g.steps) if (!groupOf.has(sid)) groupOf.set(sid, g.id);
  }
  const sourceSlots = new Map<string, Pos>();
  const sourceBuckets: { key: string; ids: string[] }[] = [];
  const bucketOf = new Map<string, { key: string; ids: string[] }>();
  const sourceBucketKey = (id: string) => {
    const groupId = groupOf.get(id);
    if (groupId) return `group:${groupId}`;
    const tos = succs.get(id);
    return tos?.length ? `to:${[...tos].sort().join("|")}` : "loose";
  };
  for (const s of steps) {
    if (pos.has(s.id) || (preds.get(s.id)?.length ?? 0) > 0) continue;
    const key = sourceBucketKey(s.id);
    let bucket = bucketOf.get(key);
    if (!bucket) {
      bucket = { key, ids: [] };
      bucketOf.set(key, bucket);
      sourceBuckets.push(bucket);
    }
    bucket.ids.push(s.id);
  }
  let sourceRow = 0;
  for (const bucket of sourceBuckets) {
    const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(bucket.ids.length))));
    for (const [i, id] of bucket.ids.entries()) {
      const row = sourceRow + Math.floor(i / cols);
      const col = (i % cols) - Math.floor((cols - 1) / 2);
      sourceSlots.set(id, { col, row });
    }
    sourceRow += Math.ceil(bucket.ids.length / cols);
  }
  const sourceCountByRow = new Map<number, number>();
  for (const slot of sourceSlots.values()) {
    sourceCountByRow.set(slot.row, (sourceCountByRow.get(slot.row) ?? 0) + 1);
  }

  // Forward edges always point to a later array index, so array order is
  // already topological.
  const rowOf = new Map<string, number>();
  steps.forEach((s, i) => {
    if (pos.has(s.id)) {
      rowOf.set(s.id, pos.get(s.id)!.row);
      return;
    }
    const ps = preds.get(s.id) ?? [];
    const sourceSlot = sourceSlots.get(s.id);
    let r: number;
    if (ps.length) r = Math.max(...ps.map((p) => (rowOf.get(p) ?? 0) + 1));
    else if (sourceSlot) r = sourceSlot.row;
    else r = i === 0 ? 0 : (rowOf.get(steps[i - 1].id) ?? 0) + 1;
    rowOf.set(s.id, r);
  });

  const layeredColumns = desiredColumnsByLayer(steps, preds, succs, rowOf, pinned);
  const offsets = [0, 1, -1, 2, -2, 3, -3];
  steps.forEach((s, i) => {
    if (pos.has(s.id)) return;
    const r = rowOf.get(s.id)!;
    const ps = preds.get(s.id) ?? [];
    const sourceSlot = sourceSlots.get(s.id);
    const layeredCol = layeredColumns.get(s.id);
    const hasPinnedPred = ps.some((p) => pinned.has(p));
    const compactSourceSlot =
      sourceSlot && (sourceCountByRow.get(sourceSlot.row) ?? 0) > 1;
    let desired = 0;
    if (compactSourceSlot) {
      desired = sourceSlot.col;
    } else if (layeredCol !== undefined && !hasPinnedPred) {
      desired = layeredCol;
    } else if (sourceSlot) {
      desired = sourceSlot.col;
    } else if (ps.length) {
      const primary = ps[0];
      const outs = fwd.filter((e) => e.from === primary).map((e) => e.to);
      const k = Math.max(0, outs.indexOf(s.id));
      desired = (pos.get(primary)?.col ?? 0) + (offsets[k] ?? k);
    } else if (i > 0) {
      desired = pos.get(steps[i - 1].id)?.col ?? 0;
    }
    desired = clampCol(desired);
    let col = desired;
    for (let d = 0; d < 60; d++) {
      const candidates =
        d === 0
          ? [desired]
          : [desired + d, desired - d].filter(
              (c) => c >= GRID_LIMITS.minCol && c <= GRID_LIMITS.maxCol
            );
      const found = candidates.find((c) => !occupied.has(okey(c, r)));
      if (found !== undefined) {
        col = found;
        break;
      }
    }
    pos.set(s.id, { col, row: r });
    occupied.add(okey(col, r));
  });

  return pos;
}

/**
 * Tidy: clean-slate re-layout that also repairs group geometry.
 * 1. Tile pins are dropped; member groups drop their explicit region, so
 *    their rect re-derives as a perfect fit around the members.
 * 2. Overlapping groups separate — later groups shift right of earlier.
 * 3. Non-member tiles are evicted from any group's footprint.
 * 4. Empty regions that collide with the layout park to its right.
 * 5. Group members end pinned (rule 2: groups anchor their members).
 * Each pass re-runs the real layout, so the result is exactly what renders.
 */
export function tidyLayout<T extends Explanation>(doc: T): T {
  const originalMembers = new Map(
    (doc.groups ?? []).map((g) => [g.id, [...g.steps]])
  );
  let work: T = {
    ...doc,
    steps: doc.steps.map((s) => {
      if (!s.grid) return s;
      const { grid: _dropped, ...rest } = s;
      return rest;
    }),
    groups: doc.groups?.map((g) =>
      g.steps.length > 0 && g.grid ? { ...g, grid: undefined } : g
    ),
  };

  work = resolveGroupConflicts(work);

  // Tidy may move tiles and reshape groups, but it must never change what
  // belongs to a group. Reassert membership after conflict repair so that
  // future layout changes cannot accidentally smuggle in coverage rules.
  if (originalMembers.size) {
    work = {
      ...work,
      groups: work.groups?.map((g) =>
        originalMembers.has(g.id)
          ? { ...g, steps: [...originalMembers.get(g.id)!] }
          : g
      ),
    };
  }

  // 5. anchor members at their final cells
  const finalPos = layoutPositions(work);
  const memberIds = new Set((work.groups ?? []).flatMap((g) => g.steps));
  if (memberIds.size) {
    work = {
      ...work,
      steps: work.steps.map((s) => {
        if (!memberIds.has(s.id) || s.grid) return s;
        const p = finalPos.get(s.id);
        return p ? { ...s, grid: { col: p.col, row: p.row } } : s;
      }),
    };
  }

  // Member groups end fitted to the members they already own. Empty groups
  // keep their explicit region because there are no members to fit around.
  if (work.groups?.some((g) => g.steps.length > 0)) {
    const pos = layoutPositions(work);
    work = {
      ...work,
      groups: work.groups.map((g) => {
        if (g.steps.length === 0) return g;
        const rect = groupMemberCellRect(g, pos);
        return rect ? { ...g, grid: rectToGrid(rect) } : g;
      }),
    };
  }
  return work;
}

function pinMissingSteps<T extends Explanation>(doc: T): T {
  const pos = layoutPositions(doc);
  let changed = false;
  const steps = doc.steps.map((s) => {
    if (s.grid) return s;
    const p = pos.get(s.id);
    if (!p) return s;
    changed = true;
    return { ...s, grid: { col: p.col, row: p.row } };
  });
  return changed ? { ...doc, steps } : doc;
}

/**
 * Tidy without throwing away manual layout. Existing step/group grids stay
 * authoritative; only missing step positions are materialized, then impossible
 * group conflicts are repaired.
 */
export function tidyPreservingLayout<T extends Explanation>(doc: T): T {
  let work = pinMissingSteps(doc);
  work = resolveGroupConflicts(work);
  work = pinMissingSteps(work);

  if (work.groups?.some((g) => g.steps.length > 0 && !g.grid)) {
    const pos = layoutPositions(work);
    let changed = false;
    const groups = work.groups.map((g) => {
      if (g.grid || g.steps.length === 0) return g;
      const rect = groupMemberCellRect(g, pos);
      if (!rect) return g;
      changed = true;
      return { ...g, grid: rectToGrid(rect) };
    });
    if (changed) work = { ...work, groups };
  }

  return work;
}

/**
 * Conflict-resolution passes shared by tidy and file load: separates
 * overlapping groups, evicts non-members from group footprints, and parks
 * colliding empty regions. Leaves existing pins alone.
 */
export function resolveGroupConflicts<T extends Explanation>(work: T): T {
  const overlap = rectsOverlap;
  const shiftRect = (r: CellRect, dCol: number, dRow: number): CellRect => ({
    minC: r.minC + dCol,
    maxC: r.maxC + dCol,
    minR: r.minR + dRow,
    maxR: r.maxR + dRow,
  });
  const rectInGrid = (r: CellRect) =>
    r.minC >= GRID_LIMITS.minCol &&
    r.maxC <= GRID_LIMITS.maxCol &&
    r.minR >= GRID_LIMITS.minRow &&
    r.maxR <= GRID_LIMITS.maxRow;
  const boundsOf = (rects: CellRect[]) => ({
    minC: Math.min(...rects.map((r) => r.minC)),
    maxC: Math.max(...rects.map((r) => r.maxC)),
    minR: Math.min(...rects.map((r) => r.minR)),
    maxR: Math.max(...rects.map((r) => r.maxR)),
  });
  const compactPlacement = (r: CellRect, placed: CellRect[]) => {
    if (!placed.some((p) => overlap(r, p))) return { rect: r, dCol: 0, dRow: 0 };
    let best: { rect: CellRect; dCol: number; dRow: number; score: number } | null =
      null;
    const limit = 24;
    for (const allowUp of [false, true]) {
      for (let dRow = -limit; dRow <= limit; dRow++) {
        if (!allowUp && dRow < 0) continue;
        for (let dCol = -limit; dCol <= limit; dCol++) {
          const shifted = shiftRect(r, dCol, dRow);
          if (!rectInGrid(shifted) || placed.some((p) => overlap(shifted, p)))
            continue;
          const b = boundsOf([...placed, shifted]);
          const width = b.maxC - b.minC + 1;
          const height = b.maxR - b.minR + 1;
          const move = Math.abs(dCol) + Math.abs(dRow);
          const negativeSpace = Math.max(0, -b.minC) + Math.max(0, -b.minR);
          const leftMove = Math.max(0, -dCol);
          const score =
            width * height * 100 +
            width * 8 +
            height * 3 +
            move * 2 +
            negativeSpace * 24 +
            leftMove * 8;
          if (!best || score < best.score)
            best = { rect: shifted, dCol, dRow, score };
        }
      }
      if (best) break;
    }
    return best ?? { rect: r, dCol: 0, dRow: 0 };
  };

  for (let iter = 0; iter < 5; iter++) {
    const pos = layoutPositions(work);
    const groups = work.groups ?? [];
    const rects = new Map<string, CellRect>();
    for (const g of groups) {
      const r = groupCellRect(g, pos);
      if (r) rects.set(g.id, r);
    }
    const pins = new Map<string, Pos>();
    const groupGridPins = new Map<string, NonNullable<Group["grid"]>>();

    // 2. separate overlapping member groups
    const placed: CellRect[] = [];
    let separated = false;
    for (const g of groups) {
      if (g.steps.length === 0) continue;
      let r = rects.get(g.id);
      if (!r) continue;
      const next = compactPlacement(r, placed);
      if (next.dCol || next.dRow) {
        separated = true;
        if (g.grid) {
          groupGridPins.set(g.id, {
            ...g.grid,
            col: g.grid.col + next.dCol,
            row: g.grid.row + next.dRow,
          });
        }
        for (const sid of g.steps) {
          const p = pos.get(sid);
          if (p)
            pins.set(sid, {
              col: p.col + next.dCol,
              row: p.row + next.dRow,
            });
        }
        r = next.rect;
      }
      placed.push(r);
    }

    // If a pass separates groups, anchor every grouped member for the next
    // pass. Otherwise unshifted groups can be re-laid out from edges that
    // originate in the shifted group, making the first group grow and the
    // separator chase it across the canvas.
    if (separated) {
      for (const g of groups) {
        if (g.steps.length === 0) continue;
        for (const sid of g.steps) {
          if (pins.has(sid)) continue;
          const p = pos.get(sid);
          if (p) pins.set(sid, p);
        }
      }
    }

    // 3. evict non-members from any group footprint (after groups settle)
    if (!separated) {
      const memberOf = new Map<string, string>();
      for (const g of groups)
        for (const sid of g.steps) memberOf.set(sid, g.id);
      const allRects = [...rects.entries()];
      const occ = new Set([...pos.values()].map((p) => `${p.col},${p.row}`));
      for (const s of work.steps) {
        const p = pos.get(s.id);
        if (!p) continue;
        const gid = memberOf.get(s.id);
        if (!allRects.some(([id, r]) => id !== gid && cellInRect(r, p)))
          continue;
        const ok = (c: number, rw: number) =>
          c >= GRID_LIMITS.minCol &&
          c <= GRID_LIMITS.maxCol &&
          rw >= GRID_LIMITS.minRow &&
          rw <= GRID_LIMITS.maxRow &&
          !occ.has(`${c},${rw}`) &&
          !allRects.some(
            ([id, r]) => id !== gid && cellInRect(r, { col: c, row: rw })
          );
        outer: for (let d = 1; d <= 30; d++) {
          for (let dr = -d; dr <= d; dr++) {
            for (let dc = -d; dc <= d; dc++) {
              if (Math.abs(dr) + Math.abs(dc) !== d) continue;
              const c = p.col + dc;
              const rw = p.row + dr;
              if (ok(c, rw)) {
                pins.set(s.id, { col: c, row: rw });
                occ.delete(`${p.col},${p.row}`);
                occ.add(`${c},${rw}`);
                break outer;
              }
            }
          }
        }
      }
    }

    // 4. park colliding empty regions to the right of everything
    let groupsChanged = groupGridPins.size > 0;
    let newGroups = groupGridPins.size
      ? work.groups?.map((g) =>
          groupGridPins.has(g.id)
            ? { ...g, grid: groupGridPins.get(g.id)! }
            : g
        )
      : work.groups;
    if (!separated && pins.size === 0) {
      let maxC = 0;
      for (const p of pos.values()) maxC = Math.max(maxC, p.col);
      for (const r of rects.values()) maxC = Math.max(maxC, r.maxC);
      newGroups = (newGroups ?? groups).map((g) => {
        if (g.steps.length > 0 || !g.grid) return g;
        const r = rects.get(g.id);
        if (!r) return g;
        const collides =
          [...pos.values()].some((p) => cellInRect(r, p)) ||
          [...rects.entries()].some(
            ([id, o]) => id !== g.id && overlap(r, o)
          );
        if (!collides) return g;
        groupsChanged = true;
        const grid = {
          ...g.grid,
          col: Math.min(maxC + 1, GRID_LIMITS.maxCol - g.grid.cols + 1),
          row: Math.max(
            GRID_LIMITS.minRow,
            Math.min(g.grid.row, GRID_LIMITS.maxRow - g.grid.rows + 1)
          ),
        };
        maxC = grid.col + grid.cols - 1;
        return { ...g, grid };
      });
    }

    if (pins.size === 0 && !groupsChanged) break;
    work = {
      ...work,
      steps: work.steps.map((s) =>
        pins.has(s.id) ? { ...s, grid: pins.get(s.id)! } : s
      ),
      groups: newGroups,
    };
  }

  return work;
}

export function worldBounds(pos: Map<string, Pos>) {
  let maxCol = 0;
  let maxRow = 0;
  for (const p of pos.values()) {
    maxCol = Math.max(maxCol, p.col);
    maxRow = Math.max(maxRow, p.row);
  }
  return { w: (maxCol + 1) * CELL_W, h: (maxRow + 1) * CELL_H, maxCol, maxRow };
}

/** Nearest unoccupied cell to (col, row), spiralling outward. */
export function nearestFreeCell(
  pos: Map<string, Pos>,
  col: number,
  row: number,
  excludeId?: string
): Pos {
  col = clampCol(Math.round(col));
  row = clampRow(Math.round(row));
  const occ = new Set<string>();
  for (const [id, p] of pos) if (id !== excludeId) occ.add(`${p.col},${p.row}`);
  if (!occ.has(`${col},${row}`)) return { col, row };
  for (let d = 1; d <= 40; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.abs(dr) + Math.abs(dc) !== d) continue;
        const c = col + dc;
        const r = row + dr;
        if (
          c >= GRID_LIMITS.minCol &&
          c <= GRID_LIMITS.maxCol &&
          r >= GRID_LIMITS.minRow &&
          r <= GRID_LIMITS.maxRow &&
          !occ.has(`${c},${r}`)
        )
          return { col: c, row: r };
      }
    }
  }
  return { col, row };
}

interface Pt {
  x: number;
  y: number;
}

function orthoPath(pts: Pt[], r = 12): string {
  const p = pts.filter(
    (pt, i) => i === 0 || pt.x !== pts[i - 1].x || pt.y !== pts[i - 1].y
  );
  if (p.length < 2) return "";
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1];
    const b = p[i];
    const c = p[i + 1];
    const rin = Math.min(r, dist(a, b) / 2, dist(b, c) / 2);
    const pin = toward(b, a, rin);
    const pout = toward(b, c, rin);
    d += ` L ${pin.x} ${pin.y} Q ${b.x} ${b.y} ${pout.x} ${pout.y}`;
  }
  const last = p[p.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function dist(a: Pt, b: Pt) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function toward(from: Pt, to: Pt, by: number): Pt {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return { x: from.x + dx * by, y: from.y + dy * by };
}

/**
 * Orthogonal routing with rounded corners, by geometry alone. Descending
 * edges leave the bottom and travel through row gutters; climbing edges
 * (loops included) take a vertical channel on whichever side of the pair
 * is cheaper — least horizontal travel, fewest blocked jogs — and enter
 * through the target's near side, never its top. Edges render under
 * tiles, so rare crossings pass behind them. A final pass slides labels
 * along their own segment into free space.
 */
export function routeEdges(
  doc: Explanation,
  pos: Map<string, Pos>
): RoutedEdge[] {
  const occupied = new Set<string>();
  for (const p of pos.values()) occupied.add(`${p.col},${p.row}`);
  const P = (id: string) => {
    const p = pos.get(id)!;
    return {
      col: p.col,
      row: p.row,
      x: p.col * CELL_W + GX,
      y: p.row * CELL_H + GY,
    };
  };
  const colClear = (c: number, r1: number, r2: number) => {
    for (let r = r1; r <= r2; r++) if (occupied.has(`${c},${r}`)) return false;
    return true;
  };
  /** True when a horizontal run at this row's centre would cross a tile. */
  const hBlocked = (
    row: number,
    x1: number,
    x2: number,
    ...exclude: string[]
  ) => {
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    for (const [sid, p] of pos) {
      if (p.row !== row || exclude.includes(sid)) continue;
      const left = p.col * CELL_W + GX;
      if (left + NODE_W > lo && left < hi) return true;
    }
    return false;
  };

  const edges = buildEdges(doc).filter((e) => pos.has(e.from) && pos.has(e.to));

  // bottom fan: only descending edges actually leave through the bottom
  const outOrder = new Map<string, EdgeDesc[]>();
  for (const e of edges) {
    if (P(e.to).row <= P(e.from).row) continue;
    const arr = outOrder.get(e.from) ?? [];
    arr.push(e);
    outOrder.set(e.from, arr);
  }

  const span = (e: EdgeDesc) =>
    Math.abs(P(e.from).row - P(e.to).row) + Math.abs(P(e.from).col - P(e.to).col);

  // Climbing edges (loops included — they are ordinary connections) pick
  // the cheaper side: horizontal detour plus a penalty for every gutter
  // jog that blocking tiles would force. Channels index per side so the
  // shortest edge hugs the tiles.
  const climbing = edges.filter((e) => P(e.to).row < P(e.from).row);
  const sideOf = new Map<string, "L" | "R">();
  for (const e of climbing) {
    const A = P(e.from);
    const B = P(e.to);
    const xr = Math.max(A.x, B.x) + NODE_W + 24;
    const xl = Math.min(A.x, B.x) - 24;
    const costR =
      xr -
      (A.x + NODE_W) +
      (xr - (B.x + NODE_W)) +
      (hBlocked(A.row, A.x + NODE_W, xr, e.from) ? 250 : 0) +
      (hBlocked(B.row, xr, B.x + NODE_W, e.to) ? 250 : 0);
    const costL =
      A.x -
      xl +
      (B.x - xl) +
      (hBlocked(A.row, xl, A.x, e.from) ? 250 : 0) +
      (hBlocked(B.row, xl, B.x, e.to) ? 250 : 0);
    sideOf.set(e.key, costL < costR ? "L" : "R");
  }
  // Lanes pool per gap column (the inter-column gap fits three 14px lanes;
  // overflow wraps to the next gap over, which is tile-free by construction)
  const chanIdx = new Map<string, number>();
  {
    const pools = new Map<string, EdgeDesc[]>();
    for (const e of climbing) {
      const side = sideOf.get(e.key)!;
      const A = P(e.from);
      const B = P(e.to);
      const gapCol =
        side === "R" ? Math.max(A.col, B.col) : Math.min(A.col, B.col);
      const k = `${side}|${gapCol}`;
      const arr = pools.get(k) ?? [];
      arr.push(e);
      pools.set(k, arr);
    }
    for (const arr of pools.values())
      arr
        .sort((a, b) => span(a) - span(b))
        .forEach((e, i) => chanIdx.set(e.key, i));
  }
  const laneOff = (lane: number) =>
    24 + (lane % 3) * 14 + Math.floor(lane / 3) * CELL_W;

  const sideCount = new Map<string, number>();
  const gutterCount = new Map<number, number>();

  /** The segment each label sits on, so placement can slide along it. */
  type Seg = { horiz: boolean; lo: number; hi: number };
  const segs = new Map<string, Seg>();

  const routed: RoutedEdge[] = [];
  for (const e of edges) {
    const A = P(e.from);
    const B = P(e.to);
    const outs = outOrder.get(e.from) ?? [];
    const oi = outs.findIndex((o) => o.key === e.key);
    const on = outs.length;
    const outX =
      A.x + NODE_W / 2 + (oi >= 0 && on > 1 ? (oi - (on - 1) / 2) * 20 : 0);

    let pts: Pt[];
    let lx: number;
    let ly: number;
    let seg: Seg | null = null;

    if (B.row === A.row) {
      if (e.kind === "loop" || e.backward) {
        // a same-row return hops the gutter above instead of degenerating
        // into a straight line through every tile on the row
        const gy = A.row * CELL_H + 10;
        pts = [
          { x: A.x + NODE_W / 2, y: A.y },
          { x: A.x + NODE_W / 2, y: gy },
          { x: B.x + NODE_W / 2, y: gy },
          { x: B.x + NODE_W / 2, y: B.y },
        ];
        lx = (A.x + B.x + NODE_W) / 2;
        ly = gy;
        seg = {
          horiz: true,
          lo: Math.min(A.x, B.x) + NODE_W / 2,
          hi: Math.max(A.x, B.x) + NODE_W / 2,
        };
      } else {
        const ay = A.y + NODE_H / 2;
        const ltr = B.col > A.col;
        const sx = ltr ? A.x + NODE_W : A.x;
        const ex = ltr ? B.x : B.x + NODE_W;
        if (!hBlocked(A.row, sx, ex, e.from, e.to)) {
          pts = [
            { x: sx, y: ay },
            { x: ex, y: ay },
          ];
          lx = (A.x + B.x + NODE_W) / 2;
          ly = ay - 14;
          seg = { horiz: true, lo: Math.min(sx, ex), hi: Math.max(sx, ex) };
        } else {
          // tiles in between — duck through the gutter below the row
          const gy = (A.row + 1) * CELL_H;
          const off = ltr ? 16 : -16;
          pts = [
            { x: sx, y: ay },
            { x: sx + off, y: ay },
            { x: sx + off, y: gy },
            { x: ex - off, y: gy },
            { x: ex - off, y: ay },
            { x: ex, y: ay },
          ];
          lx = (A.x + B.x + NODE_W) / 2;
          ly = gy;
          seg = {
            horiz: true,
            lo: Math.min(sx + off, ex - off),
            hi: Math.max(sx + off, ex - off),
          };
        }
      }
    } else if (B.row < A.row) {
      // target sits above the source — climb the chosen side's channel
      // and enter through the target's near side, never its top
      const side = sideOf.get(e.key) ?? "R";
      const off = laneOff(chanIdx.get(e.key) ?? 0);
      const chanX =
        side === "R"
          ? Math.max(A.x, B.x) + NODE_W + off
          : Math.min(A.x, B.x) - off;
      const exitX = side === "R" ? A.x + NODE_W : A.x;
      const enterX = side === "R" ? B.x + NODE_W : B.x;
      const jog = side === "R" ? 14 : -14;
      const ay = A.y + NODE_H / 2;
      const by = B.y + NODE_H / 2;
      pts = [{ x: exitX, y: ay }];
      let chanStartY = ay;
      if (
        hBlocked(A.row, Math.min(exitX, chanX), Math.max(exitX, chanX), e.from)
      ) {
        // tiles sit between the source and the channel — jog via gutter
        const gyA = A.row * CELL_H + 12; // toward the target, which is above
        pts.push({ x: exitX + jog, y: ay }, { x: exitX + jog, y: gyA });
        chanStartY = gyA;
      }
      pts.push({ x: chanX, y: chanStartY });
      let chanEndY = by;
      const entry: Pt[] = [];
      if (
        hBlocked(B.row, Math.min(chanX, enterX), Math.max(chanX, enterX), e.to)
      ) {
        const gyB = (B.row + 1) * CELL_H - 12; // approaching from below
        chanEndY = gyB;
        entry.push({ x: enterX + jog, y: gyB }, { x: enterX + jog, y: by });
      }
      pts.push({ x: chanX, y: chanEndY }, ...entry, { x: enterX, y: by });
      lx = chanX;
      ly = (chanStartY + chanEndY) / 2;
      seg = {
        horiz: false,
        lo: Math.min(chanStartY, chanEndY),
        hi: Math.max(chanStartY, chanEndY),
      };
    } else {
      // descending — straight drop, gutter run into the top, or a side
      // entry beside the target, whichever clears first
      const gIdx = gutterCount.get(A.row) ?? 0;
      gutterCount.set(A.row, gIdx + 1);
      const gy = (A.row + 1) * CELL_H + (gIdx % 4) * 12 - 18;
      const bTop = { x: B.x + NODE_W / 2, y: B.y };
      if (
        A.col === B.col &&
        outX === A.x + NODE_W / 2 &&
        colClear(A.col, A.row + 1, B.row - 1)
      ) {
        pts = [{ x: outX, y: A.y + NODE_H }, bTop];
        lx = outX;
        ly = (A.y + NODE_H + B.y) / 2;
        seg = { horiz: false, lo: A.y + NODE_H, hi: B.y };
      } else if (colClear(B.col, A.row + 1, B.row - 1)) {
        pts = [
          { x: outX, y: A.y + NODE_H },
          { x: outX, y: gy },
          { x: bTop.x, y: gy },
          bTop,
        ];
        lx = (outX + bTop.x) / 2;
        ly = gy;
        seg = {
          horiz: true,
          lo: Math.min(outX, bTop.x),
          hi: Math.max(outX, bTop.x),
        };
      } else {
        // the target's column is blocked — drop beside it and enter
        // through whichever side faces the approach
        const left = outX <= B.x + NODE_W / 2;
        const sk = `${B.col}|${left ? "L" : "R"}`;
        // four 12px lanes fit the gap; beyond that lanes repeat rather
        // than drift into the neighbouring column's tiles
        const sc = (sideCount.get(sk) ?? 0) % 4;
        sideCount.set(sk, sc + 1);
        const chanX = left ? B.x - 18 - sc * 12 : B.x + NODE_W + 18 + sc * 12;
        const enterX = left ? B.x : B.x + NODE_W;
        const by = B.y + NODE_H / 2;
        pts = [
          { x: outX, y: A.y + NODE_H },
          { x: outX, y: gy },
          { x: chanX, y: gy },
          { x: chanX, y: by },
          { x: enterX, y: by },
        ];
        lx = chanX;
        ly = (gy + by) / 2;
        seg = { horiz: false, lo: Math.min(gy, by), hi: Math.max(gy, by) };
      }
    }
    routed.push({ ...e, d: orthoPath(pts), labelX: lx, labelY: ly });
    if (seg && e.label) segs.set(e.key, seg);
  }

  // Label placement: every label prefers its natural spot but may slide
  // along its own segment — and tuck beside a vertical channel — scored
  // by how much tile and label area it would cover.
  const estW = (s: string) => Math.min(170, s.length * 5.8 + 18);
  const LBL_H = 22;
  const labelRect = (cx: number, cy: number, w: number) => ({
    l: cx - w / 2,
    t: cy - LBL_H / 2,
    r: cx + w / 2,
    b: cy + LBL_H / 2,
  });
  type Rect = ReturnType<typeof labelRect>;
  const overlapArea = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) *
    Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
  const tileRects: Rect[] = [...pos.values()].map((p) => ({
    l: p.col * CELL_W + GX,
    t: p.row * CELL_H + GY,
    r: p.col * CELL_W + GX + NODE_W,
    b: p.row * CELL_H + GY + NODE_H,
  }));

  const placedRects: Rect[] = [];
  const labeled = routed.filter((e) => e.label);
  labeled.sort((a, b) => a.labelY - b.labelY || a.labelX - b.labelX);
  for (const e of labeled) {
    const w = estW(e.label!);
    const seg = segs.get(e.key);
    const cands = [{ x: e.labelX, y: e.labelY, pen: 0 }];
    const slides = [-96, -72, -48, -24, 24, 48, 72, 96];
    if (seg?.horiz) {
      for (const s of slides) {
        const x = e.labelX + s;
        if (x >= seg.lo - 8 && x <= seg.hi + 8)
          cands.push({ x, y: e.labelY, pen: Math.abs(s) * 0.15 });
      }
    } else if (seg) {
      for (const dx of [0, -(w / 2 + 9), w / 2 + 9]) {
        for (const s of [0, ...slides]) {
          if (dx === 0 && s === 0) continue;
          const y = e.labelY + s;
          if (y >= seg.lo + 4 && y <= seg.hi - 4)
            cands.push({
              x: e.labelX + dx,
              y,
              pen: Math.abs(s) * 0.15 + (dx ? 26 : 0),
            });
        }
      }
    }
    let best = cands[0];
    let bestScore = Infinity;
    for (const c of cands) {
      const r = labelRect(c.x, c.y, w);
      let score = c.pen;
      for (const t of tileRects) score += overlapArea(r, t) / 40;
      for (const p of placedRects) score += overlapArea(r, p) / 22;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    e.labelX = best.x;
    e.labelY = best.y;
    placedRects.push(labelRect(best.x, best.y, w));
  }

  return routed;
}
