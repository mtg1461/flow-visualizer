import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CELL_H,
  CELL_W,
  GRID_LIMITS,
  GX,
  GY,
  NODE_H,
  NODE_W,
  groupCellRect,
  layoutPositions,
  normalize,
  rectsOverlap,
  routeEdges,
  tidyLayout,
  tidyPreservingLayout,
} from "../lib/graph.ts";
import { parseFlowFile } from "../lib/parse.ts";
import { SAMPLE } from "../lib/sample.ts";
import type { Explanation, FlowFile } from "../lib/types.ts";

type TileRect = {
  id: string;
  l: number;
  t: number;
  r: number;
  b: number;
};

const root = fileURLToPath(new URL("..", import.meta.url));
const examples = ["examples/thermostat.json", "examples/live-flow.json"];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadExample(path: string): FlowFile {
  const raw = readFileSync(join(root, path), "utf8");
  const parsed = parseFlowFile(raw);
  if (!parsed.ok) throw new Error(`${path}: ${parsed.error}`);
  return parsed.data;
}

function tileRects(doc: Explanation, pos: Map<string, { col: number; row: number }>) {
  return doc.steps.map((step) => {
    const p = pos.get(step.id);
    assert(p, `${doc.title}: missing position for ${step.id}`);
    const l = p.col * CELL_W + GX;
    const t = p.row * CELL_H + GY;
    return { id: step.id, l, t, r: l + NODE_W, b: t + NODE_H };
  });
}

function pointInside(rect: TileRect, x: number, y: number) {
  const eps = 0.5;
  return x > rect.l + eps && x < rect.r - eps && y > rect.t + eps && y < rect.b - eps;
}

function rectOverlap(a: Omit<TileRect, "id">, b: TileRect) {
  return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
}

function estimateLabelWidth(label: string) {
  return Math.min(170, label.length * 5.8 + 18);
}

function parsePath(d: string) {
  const tokens = d.match(/[MLQ]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  let current: { x: number; y: number } | null = null;
  const samples: { x: number; y: number }[] = [];

  const number = () => {
    const value = Number(tokens[i++]);
    assert(Number.isFinite(value), `Invalid path number in "${d}"`);
    return value;
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      current = { x: number(), y: number() };
    } else if (cmd === "L") {
      assert(current, `Line without current point in "${d}"`);
      const to = { x: number(), y: number() };
      for (let t = 0.05; t < 1; t += 0.05) {
        samples.push({
          x: current.x + (to.x - current.x) * t,
          y: current.y + (to.y - current.y) * t,
        });
      }
      current = to;
    } else if (cmd === "Q") {
      assert(current, `Curve without current point in "${d}"`);
      const control = { x: number(), y: number() };
      const to = { x: number(), y: number() };
      for (let t = 0.05; t < 1; t += 0.05) {
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        samples.push({
          x: a * current.x + b * control.x + c * to.x,
          y: a * current.y + b * control.y + c * to.y,
        });
      }
      current = to;
    } else {
      throw new Error(`Unsupported path token "${cmd}" in "${d}"`);
    }
  }

  return samples;
}

function assertPositions(doc: Explanation) {
  const pos = layoutPositions(doc);
  assert(pos.size === doc.steps.length, `${doc.title}: not every step has a position`);

  const occupied = new Map<string, string>();
  for (const step of doc.steps) {
    const p = pos.get(step.id);
    assert(p, `${doc.title}: ${step.id} has no position`);
    assert(
      p.col >= GRID_LIMITS.minCol &&
        p.col <= GRID_LIMITS.maxCol &&
        p.row >= GRID_LIMITS.minRow &&
        p.row <= GRID_LIMITS.maxRow,
      `${doc.title}: ${step.id} is outside grid limits`
    );
    const key = `${p.col},${p.row}`;
    assert(!occupied.has(key), `${doc.title}: ${step.id} overlaps ${occupied.get(key)}`);
    occupied.set(key, step.id);
  }
  return pos;
}

function assertGroups(doc: Explanation, pos: Map<string, { col: number; row: number }>) {
  const seenMembers = new Map<string, string>();
  for (const group of doc.groups ?? []) {
    for (const id of group.steps) {
      assert(doc.steps.some((step) => step.id === id), `${doc.title}: group ${group.id} has unknown step ${id}`);
      assert(!seenMembers.has(id), `${doc.title}: step ${id} belongs to multiple groups`);
      seenMembers.set(id, group.id);
    }
  }

  const rects = (doc.groups ?? [])
    .map((group) => ({ group, rect: groupCellRect(group, pos) }))
    .filter((entry): entry is { group: NonNullable<typeof entry.group>; rect: NonNullable<typeof entry.rect> } => !!entry.rect);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert(
        !rectsOverlap(rects[i].rect, rects[j].rect),
        `${doc.title}: groups ${rects[i].group.id} and ${rects[j].group.id} overlap`
      );
    }
  }
}

function assertRoutes(doc: Explanation, pos: Map<string, { col: number; row: number }>) {
  const tiles = tileRects(doc, pos);
  const edges = routeEdges(doc, pos);

  for (const edge of edges) {
    for (const sample of parsePath(edge.d)) {
      for (const tile of tiles) {
        assert(
          !pointInside(tile, sample.x, sample.y),
          `${doc.title}: edge ${edge.key} crosses tile ${tile.id}`
        );
      }
    }

    if (edge.label) {
      const w = estimateLabelWidth(edge.label);
      const label = {
        l: edge.labelX - w / 2,
        t: edge.labelY - 11,
        r: edge.labelX + w / 2,
        b: edge.labelY + 11,
      };
      for (const tile of tiles) {
        assert(
          !rectOverlap(label, tile),
          `${doc.title}: label for edge ${edge.key} overlaps tile ${tile.id}`
        );
      }
    }
  }
}

function assertPinnedPreserved(before: Explanation, after: Explanation) {
  const afterById = new Map(after.steps.map((step) => [step.id, step]));
  for (const step of before.steps) {
    if (!step.grid) continue;
    const next = afterById.get(step.id);
    assert(next?.grid, `${before.title}: pinned step ${step.id} lost its grid`);
    assert(
      next.grid.col === step.grid.col && next.grid.row === step.grid.row,
      `${before.title}: pinned step ${step.id} moved during preserving tidy`
    );
  }
}

function checkView(source: string, view: Explanation) {
  const normalized = normalize(view);
  const preserving = tidyPreservingLayout(normalized);
  const reset = tidyLayout(normalized);

  assertPinnedPreserved(normalized, preserving);

  for (const [mode, doc] of [
    ["preserve", preserving],
    ["reset", reset],
  ] as const) {
    const pos = assertPositions(doc);
    assertGroups(doc, pos);
    assertRoutes(doc, pos);
    console.log(`${source} / ${view.title} / ${mode}: ok`);
  }
}

function pathStartX(d: string) {
  const match = d.match(/^M\s+(-?\d+(?:\.\d+)?)/);
  assert(match, `Could not read path start from "${d}"`);
  return Number(match[1]);
}

function assertPositionAwareFanout() {
  const doc: Explanation = {
    title: "Position-aware fanout",
    steps: [
      {
        id: "source",
        title: "Source",
        kind: "decision",
        grid: { col: 0, row: 0 },
        branches: [
          { when: "right", to: "right" },
          { when: "left", to: "left" },
          { when: "center", to: "center" },
        ],
      },
      { id: "left", title: "Left", grid: { col: -1, row: 1 } },
      { id: "center", title: "Center", grid: { col: 0, row: 1 } },
      { id: "right", title: "Right", grid: { col: 1, row: 1 } },
    ],
  };
  const pos = assertPositions(doc);
  const source = pos.get("source");
  assert(source, "fanout source has no position");
  const sourceCenter = source.col * CELL_W + GX + NODE_W / 2;
  const byTarget = new Map(
    routeEdges(doc, pos).map((edge) => [edge.to, pathStartX(edge.d)])
  );
  const left = byTarget.get("left");
  const center = byTarget.get("center");
  const right = byTarget.get("right");
  assert(left !== undefined, "fanout left edge was not routed");
  assert(center !== undefined, "fanout center edge was not routed");
  assert(right !== undefined, "fanout right edge was not routed");
  assert(left < center && center < right, "fanout ports are not ordered by target position");
  assert(Math.abs(center - sourceCenter) < 1, "center fanout did not use the center port");
  console.log("position-aware fanout: ok");
}

const fixtures: { source: string; file: FlowFile }[] = [
  { source: "lib/sample.ts", file: SAMPLE },
  ...examples.map((source) => ({ source, file: loadExample(source) })),
];

for (const fixture of fixtures) {
  for (const view of fixture.file.views) checkView(fixture.source, view);
}

assertPositionAwareFanout();

console.log(`Geometry checks passed for ${fixtures.reduce((sum, fixture) => sum + fixture.file.views.length, 0)} views.`);
