import type { Explanation, StepKind } from "./types";

export const KIND_META: Record<StepKind, { label: string; color: string }> = {
  input: { label: "Input", color: "#7fd6c2" },
  process: { label: "Process", color: "#9b9bff" },
  decision: { label: "Decision", color: "#eec27a" },
  output: { label: "Output", color: "#ef9cbe" },
  wait: { label: "Wait", color: "#97a2b8" },
};

/** Swatches offered for custom tile and group colors. */
export const STEP_PALETTE = [
  "#9b9bff",
  "#7fd6c2",
  "#eec27a",
  "#ef9cbe",
  "#8fc7f2",
  "#c8b1f7",
  "#b8d491",
  "#f2a98c",
];

const PART_PALETTE = [
  "#9b9bff",
  "#7fd6c2",
  "#eec27a",
  "#ef9cbe",
  "#8fc7f2",
  "#c8b1f7",
  "#b8d491",
  "#f2a98c",
];

/** Stable color per moving part, in declaration order. */
export function partColors(data: Explanation): Map<string, string> {
  const map = new Map<string, string>();
  const declared = data.parts?.map((p) => p.id) ?? [];
  const used = data.steps.map((s) => s.part).filter((p): p is string => !!p);
  for (const id of [...declared, ...used]) {
    if (!map.has(id)) map.set(id, PART_PALETTE[map.size % PART_PALETTE.length]);
  }
  return map;
}

/** "#rrggbb" + alpha byte, passing through anything non-hex untouched. */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + alpha : color;
}
