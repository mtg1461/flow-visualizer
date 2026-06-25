import type { Actor, Explanation, StepKind } from "./types";
import type { ResolvedTheme } from "./theme";

const DARK_GRAPH_COLORS = {
  trigger: "#ff6b6b",
  input: "#7fd6c2",
  process: "#9b9bff",
  decision: "#eec27a",
  output: "#ef9cbe",
  wait: "#97a2b8",
  blue: "#8fc7f2",
  purple: "#c8b1f7",
  green: "#b8d491",
  orange: "#f2a98c",
} as const;

const LIGHT_GRAPH_COLORS: Record<keyof typeof DARK_GRAPH_COLORS, string> = {
  trigger: "#c73535",
  input: "#087f6b",
  process: "#6264df",
  decision: "#a36c08",
  output: "#c4477e",
  wait: "#68748a",
  blue: "#2478b8",
  purple: "#7d50c9",
  green: "#617f1d",
  orange: "#b75b28",
};

type GraphColorKey = keyof typeof DARK_GRAPH_COLORS;

const GRAPH_COLOR_KEYS: Record<string, GraphColorKey> = {
  [DARK_GRAPH_COLORS.trigger]: "trigger",
  [LIGHT_GRAPH_COLORS.trigger]: "trigger",
  [DARK_GRAPH_COLORS.input]: "input",
  [LIGHT_GRAPH_COLORS.input]: "input",
  [DARK_GRAPH_COLORS.process]: "process",
  [LIGHT_GRAPH_COLORS.process]: "process",
  [DARK_GRAPH_COLORS.decision]: "decision",
  [LIGHT_GRAPH_COLORS.decision]: "decision",
  [DARK_GRAPH_COLORS.output]: "output",
  [LIGHT_GRAPH_COLORS.output]: "output",
  [DARK_GRAPH_COLORS.wait]: "wait",
  [LIGHT_GRAPH_COLORS.wait]: "wait",
  [DARK_GRAPH_COLORS.blue]: "blue",
  [LIGHT_GRAPH_COLORS.blue]: "blue",
  [DARK_GRAPH_COLORS.purple]: "purple",
  [LIGHT_GRAPH_COLORS.purple]: "purple",
  [DARK_GRAPH_COLORS.green]: "green",
  [LIGHT_GRAPH_COLORS.green]: "green",
  [DARK_GRAPH_COLORS.orange]: "orange",
  [LIGHT_GRAPH_COLORS.orange]: "orange",
} as const;

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

export function resolveGraphColor(
  color: string,
  theme: ResolvedTheme = "dark"
): string {
  const key =
    GRAPH_COLOR_KEYS[color.toLowerCase() as keyof typeof GRAPH_COLOR_KEYS];
  if (!key) return color;
  return theme === "light" ? LIGHT_GRAPH_COLORS[key] : DARK_GRAPH_COLORS[key];
}

export function kindMeta(kind: StepKind, theme: ResolvedTheme = "dark") {
  const meta = KIND_META[kind];
  return { ...meta, color: resolveGraphColor(meta.color, theme) };
}

export function graphPalette(theme: ResolvedTheme = "dark") {
  return STEP_PALETTE.map((color) => ({
    value: color,
    color: resolveGraphColor(color, theme),
  }));
}

export function edgeThemeColors(theme: ResolvedTheme = "dark") {
  return theme === "light"
    ? {
        forward: "rgba(36,46,74,0.62)",
        feedback: LIGHT_GRAPH_COLORS.decision,
        loop: LIGHT_GRAPH_COLORS.process,
        teal: LIGHT_GRAPH_COLORS.input,
        softMarker: "rgba(36,46,74,0.8)",
      }
    : {
        forward: "rgba(232,234,248,0.65)",
        feedback: DARK_GRAPH_COLORS.decision,
        loop: "#a5a5ff",
        teal: DARK_GRAPH_COLORS.input,
        softMarker: "rgba(232,234,248,0.9)",
      };
}

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
  scope: readonly Explanation[] = [data],
  theme: ResolvedTheme = "dark"
): Map<string, string> {
  const colorScope = scope.length ? scope : [data];
  const plan = buildActorColorPlan(colorScope);
  const map = new Map<string, string>();
  const actorsById = new Map((data.actors ?? []).map((actor) => [actor.id, actor]));
  for (const id of actorIds(data)) {
    const root = plan.find(actorAliases(id, actorsById)[0]);
    map.set(
      id,
      resolveGraphColor(
        plan.colors.get(root) ?? ACTOR_PALETTE[map.size % ACTOR_PALETTE.length],
        theme
      )
    );
  }
  return map;
}

/** Stable color per group, with explicit group.color overrides preserved. */
export function groupColors(
  data: Explanation,
  theme: ResolvedTheme = "dark"
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [index, group] of (data.groups ?? []).entries()) {
    map.set(
      group.id,
      resolveGraphColor(
        group.color ?? GROUP_PALETTE[index % GROUP_PALETTE.length],
        theme
      )
    );
  }
  return map;
}

/** "#rrggbb" + alpha byte, passing through anything non-hex untouched. */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + alpha : color;
}
