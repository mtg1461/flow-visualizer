import type { Explanation, StepKind } from "./types";

export const KIND_META: Record<StepKind, { label: string; color: string }> = {
  input: { label: "Input", color: "#6cc7b2" },
  process: { label: "Process", color: "#8f8ffc" },
  decision: { label: "Decision", color: "#e0b463" },
  output: { label: "Output", color: "#e289ae" },
  wait: { label: "Wait", color: "#8a93a8" },
};

const PART_PALETTE = [
  "#8f8ffc",
  "#6cc7b2",
  "#e0b463",
  "#e289ae",
  "#7db8e8",
  "#b9a3ef",
  "#a3c98a",
  "#e8a37d",
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

export interface FlowStats {
  steps: number;
  parts: number;
  decisions: number;
  feedback: number;
}

export function flowStats(data: Explanation): FlowStats {
  const index = new Map(data.steps.map((s, i) => [s.id, i]));
  let feedback = data.loops?.length ?? 0;
  for (const s of data.steps) {
    const from = index.get(s.id) ?? 0;
    for (const b of s.branches ?? [])
      if ((index.get(b.to) ?? Infinity) < from) feedback++;
    if (s.then && (index.get(s.then) ?? Infinity) < from) feedback++;
  }
  const partIds = new Set<string>(data.parts?.map((p) => p.id));
  for (const s of data.steps) if (s.part) partIds.add(s.part);
  return {
    steps: data.steps.length,
    parts: partIds.size,
    decisions: data.steps.filter((s) => s.kind === "decision").length,
    feedback,
  };
}
