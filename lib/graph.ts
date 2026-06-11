import type { Explanation } from "./types";

/** Tile geometry — node tiles sit centered in grid cells. */
export const CELL_W = 320;
export const CELL_H = 200;
export const NODE_W = 256;
export const NODE_H = 140;
export const GX = (CELL_W - NODE_W) / 2;
export const GY = (CELL_H - NODE_H) / 2;

export interface Pos {
  col: number;
  row: number;
}

export type EdgeRef =
  | { type: "flow"; from: string }
  | { type: "branch"; from: string; index: number }
  | { type: "loop"; index: number };

export type Selection =
  | { kind: "step"; id: string }
  | { kind: "edge"; ref: EdgeRef };

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
    if (s.then && next && s.then === next.id && !s.branches?.length) {
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
      });
    });
    if (s.then && idx.has(s.then)) {
      out.push({
        ref: { type: "flow", from: s.id },
        key: `f-${s.id}`,
        from: s.id,
        to: s.then,
        backward: idx.get(s.then)! <= idx.get(s.id)!,
        kind: "flow",
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
    desired = Math.max(0, desired);
    let col = desired;
    for (let d = 0; d < 60; d++) {
      const candidates =
        d === 0 ? [desired] : [desired + d, desired - d].filter((c) => c >= 0);
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
  col = Math.max(0, Math.round(col));
  row = Math.max(0, Math.round(row));
  const occ = new Set<string>();
  for (const [id, p] of pos) if (id !== excludeId) occ.add(`${p.col},${p.row}`);
  if (!occ.has(`${col},${row}`)) return { col, row };
  for (let d = 1; d <= 40; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.abs(dr) + Math.abs(dc) !== d) continue;
        const c = col + dc;
        const r = row + dr;
        if (c >= 0 && r >= 0 && !occ.has(`${c},${r}`)) return { col: c, row: r };
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
  const rightChan = new Map<string, number>();
  edges
    .filter((e) => e.backward && e.kind !== "loop")
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

    if (e.kind === "loop") {
      const chan = leftChan.get(e.key) ?? 0;
      const chanX = Math.min(A.x, B.x) - 24 - chan * 14;
      const ay = A.y + NODE_H / 2;
      const by = B.y + NODE_H / 2;
      pts = [
        { x: A.x, y: ay },
        { x: chanX, y: ay },
        { x: chanX, y: by },
        { x: B.x, y: by },
      ];
      lx = chanX;
      ly = (ay + by) / 2;
    } else if (e.backward) {
      if (A.row === B.row) {
        // same-row feedback hops over the top gutter
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
        const chan = rightChan.get(e.key) ?? 0;
        const chanX = Math.max(A.x, B.x) + NODE_W + 24 + chan * 14;
        const ay = A.y + NODE_H / 2;
        const by = B.y + NODE_H / 2;
        pts = [
          { x: A.x + NODE_W, y: ay },
          { x: chanX, y: ay },
          { x: chanX, y: by },
          { x: B.x + NODE_W, y: by },
        ];
        lx = chanX;
        ly = (ay + by) / 2;
      }
    } else if (B.row === A.row) {
      const ay = A.y + NODE_H / 2;
      pts =
        B.col > A.col
          ? [
              { x: A.x + NODE_W, y: ay },
              { x: B.x, y: ay },
            ]
          : [
              { x: A.x, y: ay },
              { x: B.x + NODE_W, y: ay },
            ];
      lx = (A.x + B.x + NODE_W) / 2;
      ly = ay - 14;
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
  return routed;
}
