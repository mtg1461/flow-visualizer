import type { EdgeLine, Explanation, Step, StepKind } from "./types";

const KINDS: StepKind[] = ["input", "process", "decision", "output", "wait"];
const LINES: EdgeLine[] = ["solid", "dashed", "dotted"];

function asLine(v: unknown): EdgeLine | undefined {
  return LINES.includes(v as EdgeLine) ? (v as EdgeLine) : undefined;
}

export type ParseResult =
  | { ok: true; data: Explanation }
  | { ok: false; error: string };

/** Accepts raw agent output: tolerates markdown fences and leading prose. */
export function parseExplanation(raw: string): ParseResult {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    if (start === -1) return { ok: false, error: "No JSON object found in the pasted text." };
    text = text.slice(start);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON — ${(e as Error).message}` };
  }

  if (typeof json !== "object" || json === null || Array.isArray(json))
    return { ok: false, error: "Expected a JSON object at the top level." };

  const obj = json as Record<string, unknown>;
  if (typeof obj.title !== "string" || !obj.title.trim())
    return { ok: false, error: `Missing "title" — a short name for what is being explained.` };
  if (!Array.isArray(obj.steps) || obj.steps.length === 0)
    return { ok: false, error: `Missing "steps" — the ordered sequence is the spine of the flow.` };

  const steps: Step[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < obj.steps.length; i++) {
    const s = obj.steps[i] as Record<string, unknown>;
    if (typeof s !== "object" || s === null)
      return { ok: false, error: `Step ${i + 1} is not an object.` };
    const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : `step-${i + 1}`;
    if (ids.has(id)) return { ok: false, error: `Duplicate step id "${id}".` };
    ids.add(id);
    if (typeof s.title !== "string" || !s.title.trim())
      return { ok: false, error: `Step ${i + 1} is missing a "title".` };
    const kind = KINDS.includes(s.kind as StepKind) ? (s.kind as StepKind) : "process";
    steps.push({
      id,
      title: s.title.trim(),
      detail: typeof s.detail === "string" ? s.detail : undefined,
      kind,
      part: typeof s.part === "string" ? s.part : undefined,
      inputs: strArray(s.inputs),
      outputs: strArray(s.outputs),
      branches: Array.isArray(s.branches)
        ? s.branches
            .filter(
              (b): b is Record<string, unknown> & { when: string; to: string } =>
                typeof b === "object" && b !== null &&
                typeof (b as Record<string, unknown>).when === "string" &&
                typeof (b as Record<string, unknown>).to === "string"
            )
            .map((b) => ({
              when: b.when,
              to: b.to,
              color: typeof b.color === "string" ? b.color : undefined,
              line: asLine(b.line),
            }))
        : undefined,
      then: typeof s.then === "string" ? s.then : undefined,
      thenLabel: typeof s.thenLabel === "string" ? s.thenLabel : undefined,
      thenColor: typeof s.thenColor === "string" ? s.thenColor : undefined,
      thenLine: asLine(s.thenLine),
      note: typeof s.note === "string" ? s.note : undefined,
      grid: isGrid(s.grid) ? { col: s.grid.col, row: s.grid.row } : undefined,
      color: typeof s.color === "string" ? s.color : undefined,
    });
  }

  for (const step of steps) {
    for (const b of step.branches ?? [])
      if (!ids.has(b.to))
        return { ok: false, error: `Step "${step.id}" branches to unknown step "${b.to}".` };
    if (step.then && !ids.has(step.then))
      return { ok: false, error: `Step "${step.id}" points to unknown step "${step.then}".` };
  }

  const loops = Array.isArray(obj.loops)
    ? (obj.loops as Record<string, unknown>[])
        .filter((l) => typeof l?.from === "string" && typeof l?.to === "string")
        .map((l) => ({
          from: l.from as string,
          to: l.to as string,
          label: typeof l.label === "string" ? l.label : undefined,
          color: typeof l.color === "string" ? l.color : undefined,
          line: asLine(l.line),
        }))
        .filter((l) => ids.has(l.from) && ids.has(l.to))
    : undefined;

  const parts = Array.isArray(obj.parts)
    ? (obj.parts as Record<string, unknown>[])
        .filter((p) => typeof p?.id === "string" && typeof p?.name === "string")
        .map((p) => ({
          id: p.id as string,
          name: p.name as string,
          role: typeof p.role === "string" ? p.role : undefined,
        }))
    : undefined;

  let groups = Array.isArray(obj.groups)
    ? (obj.groups as Record<string, unknown>[])
        .filter((g) => typeof g?.label === "string" && Array.isArray(g?.steps))
        .map((g, i) => ({
          id: typeof g.id === "string" && g.id ? g.id : `group-${i + 1}`,
          label: g.label as string,
          color: typeof g.color === "string" ? g.color : undefined,
          steps: (g.steps as unknown[])
            .filter((x): x is string => typeof x === "string")
            .filter((id) => ids.has(id)),
          grid: isGroupGrid(g.grid) ? g.grid : undefined,
        }))
    : undefined;
  if (groups) {
    // a step belongs to at most one group — first declaration wins
    const claimed = new Set<string>();
    groups = groups
      .map((g) => ({
        ...g,
        steps: g.steps.filter(
          (id) => !claimed.has(id) && (claimed.add(id), true)
        ),
      }))
      .filter((g) => g.steps.length > 0 || g.grid);
  }

  return {
    ok: true,
    data: {
      title: obj.title.trim(),
      summary: typeof obj.summary === "string" ? obj.summary : undefined,
      parts,
      steps,
      loops,
      groups,
    },
  };
}

function isGroupGrid(
  v: unknown
): v is { col: number; row: number; cols: number; rows: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    ["col", "row", "cols", "rows"].every(
      (k) => typeof (v as Record<string, unknown>)[k] === "number"
    )
  );
}

function isGrid(v: unknown): v is { col: number; row: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).col === "number" &&
    typeof (v as Record<string, unknown>).row === "number"
  );
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return out.length ? out : undefined;
}
