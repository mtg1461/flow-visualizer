import type { Explanation } from "./types";
import type { EdgeRef } from "./graph";

export type MultiSelectionItem = { kind: "step" | "group"; id: string };

export type Selection =
  | { kind: "step"; id: string }
  | { kind: "edge"; ref: EdgeRef }
  | { kind: "group"; id: string }
  | { kind: "multi"; items: MultiSelectionItem[] };

export function selectionItems(sel: Selection | null): MultiSelectionItem[] {
  if (!sel) return [];
  if (sel.kind === "step" || sel.kind === "group")
    return [{ kind: sel.kind, id: sel.id }];
  if (sel.kind === "multi") return sel.items;
  return [];
}

export function selectionItemKey(item: MultiSelectionItem) {
  return `${item.kind}:${item.id}`;
}

export function normalizeSelection(
  items: MultiSelectionItem[]
): Selection | null {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = selectionItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return { kind: "multi", items: unique };
}

export function toggleSelectionItem(
  current: Selection | null,
  item: MultiSelectionItem
): Selection | null {
  const key = selectionItemKey(item);
  const items = selectionItems(current);
  const hasItem = items.some((existing) => selectionItemKey(existing) === key);
  return normalizeSelection(
    hasItem
      ? items.filter((existing) => selectionItemKey(existing) !== key)
      : [...items, item]
  );
}

/** Drops a selection that points at something the current view lacks. */
export function validSelection(
  doc: Explanation,
  sel: Selection | null
): Selection | null {
  if (!sel) return null;
  if (sel.kind === "step")
    return doc.steps.some((step) => step.id === sel.id) ? sel : null;
  if (sel.kind === "group")
    return doc.groups?.some((group) => group.id === sel.id) ? sel : null;
  if (sel.kind === "multi") {
    return normalizeSelection(
      sel.items.filter((item) =>
        item.kind === "step"
          ? doc.steps.some((step) => step.id === item.id)
          : doc.groups?.some((group) => group.id === item.id)
      )
    );
  }

  const ref = sel.ref;
  if (ref.type === "flow")
    return doc.steps.find((step) => step.id === ref.from)?.then ? sel : null;
  if (ref.type === "branch")
    return (
      (doc.steps.find((step) => step.id === ref.from)?.branches?.length ?? 0) >
      ref.index
    )
      ? sel
      : null;
  return (doc.loops?.length ?? 0) > ref.index ? sel : null;
}
