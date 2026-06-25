import type { Explanation } from "./types";
import type { EdgeDesc, EdgeRef } from "./graphTypes";

export function edgeKey(ref: EdgeRef): string {
  if (ref.type === "flow") return `f-${ref.from}`;
  if (ref.type === "branch") return `b-${ref.from}-${ref.index}`;
  return `l-${ref.index}`;
}

/**
 * Connections are explicit. Step array order is only storage/order metadata;
 * it must never create an edge on load or remove one on export.
 */
export function normalize<T extends Explanation>(doc: T): T {
  const pairKey = (from: string, to: string) => `${from}\u0000${to}`;
  const branchPairs = new Set<string>();
  const flowPairs = new Map<string, number>();
  let changed = false;

  const steps = doc.steps.map((s, i) => {
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
  return doc;
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
