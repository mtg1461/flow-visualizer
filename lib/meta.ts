import type { Actor, Explanation, StepKind } from "./types";

export const KIND_META: Record<StepKind, { label: string; color: string }> = {
  trigger: { label: "Trigger", color: "#ff6b6b" },
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

const GROUP_PALETTE = [
  "#7fd6c2",
  "#9b9bff",
  "#eec27a",
  "#ef9cbe",
  "#8fc7f2",
  "#b8d491",
  "#c8b1f7",
  "#f2a98c",
];

const ACTOR_PALETTE = [
  "#9b9bff",
  "#7fd6c2",
  "#eec27a",
  "#ef9cbe",
  "#8fc7f2",
  "#c8b1f7",
  "#b8d491",
  "#f2a98c",
];

function actorIds(data: Explanation) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    const clean = id?.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    ids.push(clean);
  };
  for (const actor of data.actors ?? []) add(actor.id);
  for (const step of data.steps) add(step.actor);
  return ids;
}

function actorKey(value: string) {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || "actor";
}

function actorAliases(id: string, actorsById: Map<string, Actor>) {
  const actor = actorsById.get(id);
  return [
    actorKey(id),
    ...(actor?.name ? [actorKey(actor.name)] : []),
  ].filter((key, index, keys) => key && keys.indexOf(key) === index);
}

function buildActorColorPlan(scope: readonly Explanation[]) {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const p = parent.get(key);
    if (!p) {
      parent.set(key, key);
      return key;
    }
    if (p === key) return key;
    const root = find(p);
    parent.set(key, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ar = find(a);
    const br = find(b);
    if (ar !== br) parent.set(br, ar);
  };

  for (const view of scope) {
    const actorsById = new Map((view.actors ?? []).map((actor) => [actor.id, actor]));
    for (const id of actorIds(view)) {
      const aliases = actorAliases(id, actorsById);
      for (const alias of aliases) find(alias);
      for (const alias of aliases.slice(1)) union(aliases[0], alias);
    }
  }

  const colors = new Map<string, string>();
  for (const view of scope) {
    const actorsById = new Map((view.actors ?? []).map((actor) => [actor.id, actor]));
    for (const id of actorIds(view)) {
      const root = find(actorAliases(id, actorsById)[0]);
      if (!colors.has(root))
        colors.set(root, ACTOR_PALETTE[colors.size % ACTOR_PALETTE.length]);
    }
  }
  return { colors, find };
}

/** Stable color per actor, shared across a file-wide view scope when provided. */
export function actorColors(
  data: Explanation,
  scope: readonly Explanation[] = [data]
): Map<string, string> {
  const colorScope = scope.length ? scope : [data];
  const plan = buildActorColorPlan(colorScope);
  const map = new Map<string, string>();
  const actorsById = new Map((data.actors ?? []).map((actor) => [actor.id, actor]));
  for (const id of actorIds(data)) {
    const root = plan.find(actorAliases(id, actorsById)[0]);
    map.set(id, plan.colors.get(root) ?? ACTOR_PALETTE[map.size % ACTOR_PALETTE.length]);
  }
  return map;
}

/** Stable color per group, with explicit group.color overrides preserved. */
export function groupColors(data: Explanation): Map<string, string> {
  const map = new Map<string, string>();
  for (const [index, group] of (data.groups ?? []).entries()) {
    map.set(group.id, group.color ?? GROUP_PALETTE[index % GROUP_PALETTE.length]);
  }
  return map;
}

/** "#rrggbb" + alpha byte, passing through anything non-hex untouched. */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + alpha : color;
}
