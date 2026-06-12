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
export function normalize(doc: Explanation): Explanation {
  const steps = doc.steps.map((s, i) => {
    const next = doc.steps[i + 1];
    if (!s.branches?.length && !s.then && next) return { ...s, then: next.id };
    return s;
  });
  return { ...doc, steps };
}

export function denormalize(doc: Explanation): Explanation {
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

  const fwd = buildEdges(doc).filter((e) => e.kind !== "loop" && !e.backward);
  const preds = new Map<string, string[]>();
  for (const e of fwd) {
    const arr = preds.get(e.to) ?? [];
    arr.push(e.from);
    preds.set(e.to, arr);
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
    let r: number;
    if (ps.length) r = Math.max(...ps.map((p) => (rowOf.get(p) ?? 0) + 1));
    else r = i === 0 ? 0 : (rowOf.get(steps[i - 1].id) ?? 0) + 1;
    rowOf.set(s.id, r);
  });

  const offsets = [0, 1, -1, 2, -2, 3, -3];
  steps.forEach((s, i) => {
    if (pos.has(s.id)) return;
    const r = rowOf.get(s.id)!;
    const ps = preds.get(s.id) ?? [];
    let desired = 0;
    if (ps.length) {
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
export function tidyLayout(doc: Explanation): Explanation {
  let work: Explanation = {
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
  return work;
}

/**
 * Conflict-resolution passes shared by Tidy and JSON import: separates
 * overlapping groups, evicts non-members from group footprints, and parks
 * colliding empty regions. Leaves existing pins alone.
 */
export function resolveGroupConflicts(work: Explanation): Explanation {
  const overlap = rectsOverlap;

  for (let iter = 0; iter < 5; iter++) {
    const pos = layoutPositions(work);
    const groups = work.groups ?? [];
    const rects = new Map<string, CellRect>();
    for (const g of groups) {
      const r = groupCellRect(g, pos);
      if (r) rects.set(g.id, r);
    }
    const pins = new Map<string, Pos>();

    // 2. separate overlapping member groups
    const placed: CellRect[] = [];
    let separated = false;
    for (const g of groups) {
      if (g.steps.length === 0) continue;
      let r = rects.get(g.id);
      if (!r) continue;
      let dCol = 0;
      let guard = 0;
      while (guard++ < 12) {
        const shifted = {
          minC: r.minC + dCol,
          maxC: r.maxC + dCol,
          minR: r.minR,
          maxR: r.maxR,
        };
        const hit = placed.find((p) => overlap(shifted, p));
        if (!hit) break;
        dCol = hit.maxC - r.minC + 1;
      }
      if (dCol > 0 && r.maxC + dCol <= GRID_LIMITS.maxCol) {
        separated = true;
        for (const sid of g.steps) {
          const p = pos.get(sid);
          if (p) pins.set(sid, { col: p.col + dCol, row: p.row });
        }
        r = { ...r, minC: r.minC + dCol, maxC: r.maxC + dCol };
      }
      placed.push(r);
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
    let groupsChanged = false;
    let newGroups = work.groups;
    if (!separated && pins.size === 0) {
      let maxC = 0;
      for (const p of pos.values()) maxC = Math.max(maxC, p.col);
      for (const r of rects.values()) maxC = Math.max(maxC, r.maxC);
      newGroups = groups.map((g) => {
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
 * Orthogonal routing with rounded corners. Forward edges leave the bottom
 * and travel through row gutters; backward (feedback) edges run up vertical
 * channels right of the tiles; system loops run up channels on the left.
 * Edges render under tiles, so rare crossings pass behind them.
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

  const outOrder = new Map<string, EdgeDesc[]>();
  for (const e of edges) {
    if (e.kind === "loop") continue;
    const arr = outOrder.get(e.from) ?? [];
    arr.push(e);
    outOrder.set(e.from, arr);
  }

  const span = (e: EdgeDesc) =>
    Math.abs(P(e.from).row - P(e.to).row) + Math.abs(P(e.from).col - P(e.to).col);
  // edges that climb a right-side channel: any non-loop edge whose target
  // sits on a higher row, regardless of narrative direction
  const rightChan = new Map<string, number>();
  edges
    .filter((e) => e.kind !== "loop" && P(e.to).row < P(e.from).row)
    .sort((a, b) => span(a) - span(b))
    .forEach((e, i) => rightChan.set(e.key, i));
  const leftChan = new Map<string, number>();
  edges
    .filter((e) => e.kind === "loop")
    .sort((a, b) => span(a) - span(b))
    .forEach((e, i) => leftChan.set(e.key, i));
  const sideCount = new Map<number, number>();
  const gutterCount = new Map<number, number>();

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

    if (e.kind === "loop" && A.row === B.row) {
      // a loop along one row hops the gutter above instead of degenerating
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
    } else if (e.kind === "loop") {
      const chan = leftChan.get(e.key) ?? 0;
      const chanX = Math.min(A.x, B.x) - 24 - chan * 14;
      const ay = A.y + NODE_H / 2;
      const by = B.y + NODE_H / 2;
      pts = [{ x: A.x, y: ay }];
      let chanStartY = ay;
      if (hBlocked(A.row, chanX, A.x, e.from)) {
        // tiles sit between the source and the channel — jog via gutter
        const gyA =
          B.row < A.row ? A.row * CELL_H + 12 : (A.row + 1) * CELL_H - 12;
        pts.push({ x: A.x - 14, y: ay }, { x: A.x - 14, y: gyA });
        chanStartY = gyA;
      }
      pts.push({ x: chanX, y: chanStartY });
      let chanEndY = by;
      const entry: { x: number; y: number }[] = [];
      if (hBlocked(B.row, chanX, B.x, e.to)) {
        const gyB =
          A.row < B.row ? B.row * CELL_H + 12 : (B.row + 1) * CELL_H - 12;
        chanEndY = gyB;
        entry.push({ x: B.x - 14, y: gyB }, { x: B.x - 14, y: by });
      }
      pts.push({ x: chanX, y: chanEndY }, ...entry, { x: B.x, y: by });
      lx = chanX;
      ly = (chanStartY + chanEndY) / 2;
    } else if (B.row < A.row) {
      // target sits above the source — climb a right-side channel and
      // enter through the target's side, never its top
      const chan = rightChan.get(e.key) ?? 0;
      const chanX = Math.max(A.x, B.x) + NODE_W + 24 + chan * 14;
      const ay = A.y + NODE_H / 2;
      const by = B.y + NODE_H / 2;
      pts = [{ x: A.x + NODE_W, y: ay }];
      let chanStartY = ay;
      if (hBlocked(A.row, A.x + NODE_W, chanX, e.from)) {
        const gyA = A.row * CELL_H + 12; // toward the target, which is above
        pts.push(
          { x: A.x + NODE_W + 14, y: ay },
          { x: A.x + NODE_W + 14, y: gyA }
        );
        chanStartY = gyA;
      }
      pts.push({ x: chanX, y: chanStartY });
      let chanEndY = by;
      const entry: { x: number; y: number }[] = [];
      if (hBlocked(B.row, chanX, B.x + NODE_W, e.to)) {
        const gyB = (B.row + 1) * CELL_H - 12; // approaching from below
        chanEndY = gyB;
        entry.push(
          { x: B.x + NODE_W + 14, y: gyB },
          { x: B.x + NODE_W + 14, y: by }
        );
      }
      pts.push({ x: chanX, y: chanEndY }, ...entry, { x: B.x + NODE_W, y: by });
      lx = chanX;
      ly = (chanStartY + chanEndY) / 2;
    } else if (B.row === A.row) {
      if (e.backward) {
        // same-row retry hops over the top gutter
        const gy = A.row * CELL_H + 10;
        pts = [
          { x: A.x + NODE_W / 2, y: A.y },
          { x: A.x + NODE_W / 2, y: gy },
          { x: B.x + NODE_W / 2, y: gy },
          { x: B.x + NODE_W / 2, y: B.y },
        ];
        lx = (A.x + B.x + NODE_W) / 2;
        ly = gy;
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
        }
      }
    } else {
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
      } else if (colClear(B.col, A.row + 1, B.row - 1)) {
        pts = [
          { x: outX, y: A.y + NODE_H },
          { x: outX, y: gy },
          { x: bTop.x, y: gy },
          bTop,
        ];
        lx = (outX + bTop.x) / 2;
        ly = gy;
      } else {
        const sc = sideCount.get(B.col) ?? 0;
        sideCount.set(B.col, sc + 1);
        const chanX = B.x + NODE_W + 18 + sc * 12;
        const by = B.y + NODE_H / 2;
        pts = [
          { x: outX, y: A.y + NODE_H },
          { x: outX, y: gy },
          { x: chanX, y: gy },
          { x: chanX, y: by },
          { x: B.x + NODE_W, y: by },
        ];
        lx = chanX;
        ly = (gy + by) / 2;
      }
    }
    routed.push({ ...e, d: orthoPath(pts), labelX: lx, labelY: ly });
  }

  // nudge overlapping labels apart (top-down, so pushes accumulate)
  const estW = (s: string) => Math.min(170, s.length * 5.8 + 18);
  const labeled = routed.filter((e) => e.label);
  labeled.sort((a, b) => a.labelY - b.labelY || a.labelX - b.labelX);
  for (let i = 1; i < labeled.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = labeled[j];
      const b = labeled[i];
      if (
        Math.abs(a.labelX - b.labelX) * 2 < estW(a.label!) + estW(b.label!) &&
        Math.abs(a.labelY - b.labelY) < 22
      ) {
        b.labelY = a.labelY + 22;
      }
    }
  }

  return routed;
}
