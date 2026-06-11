"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EdgeLine, Explanation, Step } from "@/lib/types";
import { SAMPLE } from "@/lib/sample";
import {
  type EdgeRef,
  type Pos,
  type Selection,
  layoutPositions,
  nearestFreeCell,
  normalize,
} from "@/lib/graph";
import { Canvas } from "./Canvas";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { Inspector, type EditorActions } from "./Inspector";
import { Toolbar } from "./Toolbar";
import { JsonDialog } from "./JsonDialog";

export const STORAGE_KEY = "unfold:data";

interface Props {
  initial: Explanation;
  initialCustom: boolean;
}

export function Editor({ initial, initialCustom }: Props) {
  const [doc, setDocState] = useState<Explanation>(() => normalize(initial));
  const [isCustom, setIsCustom] = useState(initialCustom);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const setDoc = useCallback((next: Explanation) => {
    setDocState(next);
    setIsCustom(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — edits still live for this session
    }
  }, []);

  const positions = useMemo(() => layoutPositions(doc), [doc]);

  /* ------------------------------------------------------- mutations */

  const updateStep = useCallback(
    (id: string, patch: Partial<Step>) => {
      setDocState((d) => {
        const next = {
          ...d,
          steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        };
        setIsCustom(true);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  const deleteStep = useCallback(
    (id: string) => {
      setDocState((d) => {
        if (d.steps.length <= 1) return d;
        const dying = d.steps.find((s) => s.id === id);
        const heal = dying?.then && dying.then !== id ? dying.then : undefined;
        const next: Explanation = {
          ...d,
          steps: d.steps
            .filter((s) => s.id !== id)
            .map((s) => ({
              ...s,
              then: s.then === id ? heal : s.then,
              branches: s.branches
                ?.map((b) => (b.to === id && heal ? { ...b, to: heal } : b))
                .filter((b) => b.to !== id),
            })),
          loops: d.loops?.filter((l) => l.from !== id && l.to !== id),
          groups: d.groups
            ?.map((g) => ({ ...g, steps: g.steps.filter((s) => s !== id) }))
            .filter((g) => g.steps.length > 0),
        };
        setIsCustom(true);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      setSelection(null);
    },
    []
  );

  const addStep = useCallback(
    (opts?: { afterId?: string; cell?: Pos }) => {
      let n = doc.steps.length + 1;
      while (doc.steps.some((s) => s.id === `step-${n}`)) n++;
      const id = `step-${n}`;

      const afterId =
        opts?.afterId ??
        (opts?.cell ? null : selection?.kind === "step" ? selection.id : null);
      let cell: Pos;
      if (opts?.cell) {
        cell = nearestFreeCell(positions, opts.cell.col, opts.cell.row);
      } else {
        const anchor = afterId
          ? positions.get(afterId)
          : [...positions.values()].reduce<Pos | null>(
              (acc, p) => (!acc || p.row > acc.row ? p : acc),
              null
            );
        cell = nearestFreeCell(
          positions,
          anchor?.col ?? 0,
          (anchor?.row ?? -1) + 1
        );
      }

      const newStep: Step = { id, title: "New step", kind: "process", grid: cell };
      let steps: Step[];
      if (afterId) {
        // insert into the flow after the anchor step
        const i = doc.steps.findIndex((s) => s.id === afterId);
        const sel = doc.steps[i];
        const inherited = !sel.branches?.length ? sel.then : undefined;
        steps = [...doc.steps];
        steps[i] = inherited ? { ...sel, then: id } : sel;
        steps.splice(
          i + 1,
          0,
          inherited ? { ...newStep, then: inherited } : newStep
        );
      } else {
        steps = [...doc.steps, newStep];
      }
      setDoc({ ...doc, steps });
      setSelection({ kind: "step", id });
    },
    [doc, selection, positions, setDoc]
  );

  const moveNode = useCallback(
    (id: string, cell: Pos) => updateStep(id, { grid: cell }),
    [updateStep]
  );

  const completeConnect = useCallback(
    (to: string) => {
      const from = connectFrom;
      setConnectFrom(null);
      if (!from || from === to) return;
      const src = doc.steps.find((s) => s.id === from);
      if (!src) return;
      if (src.kind === "decision") {
        if (src.branches?.some((b) => b.to === to)) return;
        const branches = [...(src.branches ?? []), { when: "when…", to }];
        updateStep(from, { branches });
        setSelection({
          kind: "edge",
          ref: { type: "branch", from, index: branches.length - 1 },
        });
      } else if (!src.then) {
        updateStep(from, { then: to });
        setSelection({ kind: "edge", ref: { type: "flow", from } });
      } else if (src.then === to) {
        setSelection({ kind: "edge", ref: { type: "flow", from } });
      } else {
        // the flow edge exists — additional connections become loop entries
        const loops = [...(doc.loops ?? []), { from, to }];
        setDoc({ ...doc, loops });
        setSelection({
          kind: "edge",
          ref: { type: "loop", index: loops.length - 1 },
        });
      }
    },
    [connectFrom, doc, updateStep, setDoc]
  );

  const deleteEdge = useCallback(
    (ref: EdgeRef) => {
      if (ref.type === "flow") {
        updateStep(ref.from, { then: undefined });
      } else if (ref.type === "branch") {
        const src = doc.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).filter((_, i) => i !== ref.index);
        updateStep(ref.from, {
          branches: branches.length ? branches : undefined,
        });
      } else {
        setDoc({
          ...doc,
          loops: doc.loops?.filter((_, i) => i !== ref.index),
        });
      }
      setSelection(null);
    },
    [doc, updateStep, setDoc]
  );

  const updateEdgeLabel = useCallback(
    (ref: EdgeRef, label: string) => {
      if (ref.type === "branch") {
        const src = doc.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).map((b, i) =>
          i === ref.index ? { ...b, when: label } : b
        );
        updateStep(ref.from, { branches });
      } else if (ref.type === "loop") {
        setDoc({
          ...doc,
          loops: doc.loops?.map((l, i) =>
            i === ref.index ? { ...l, label: label || undefined } : l
          ),
        });
      } else {
        updateStep(ref.from, { thenLabel: label || undefined });
      }
    },
    [doc, updateStep, setDoc]
  );

  const updateEdgeStyle = useCallback(
    (ref: EdgeRef, patch: { color?: string | null; line?: EdgeLine | null }) => {
      const color =
        patch.color === undefined ? undefined : (patch.color ?? undefined);
      const line =
        patch.line === undefined ? undefined : (patch.line ?? undefined);
      const apply = <T extends { color?: string; line?: EdgeLine }>(o: T): T => ({
        ...o,
        ...("color" in patch ? { color } : {}),
        ...("line" in patch ? { line } : {}),
      });
      if (ref.type === "branch") {
        const src = doc.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).map((b, i) =>
          i === ref.index ? apply(b) : b
        );
        updateStep(ref.from, { branches });
      } else if (ref.type === "loop") {
        setDoc({
          ...doc,
          loops: doc.loops?.map((l, i) => (i === ref.index ? apply(l) : l)),
        });
      } else {
        updateStep(ref.from, {
          ...("color" in patch ? { thenColor: color } : {}),
          ...("line" in patch ? { thenLine: line } : {}),
        });
      }
    },
    [doc, updateStep, setDoc]
  );

  const actions: EditorActions = useMemo(
    () => ({
      updateDoc: (patch) => setDoc({ ...doc, ...patch }),
      updateStep,
      deleteStep,
      startConnect: (id) => setConnectFrom(id),
      deleteEdge,
      updateEdgeLabel,
      updateEdgeStyle,
      addPart: (name) => {
        let base = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "part";
        let id = base;
        let n = 2;
        while ((doc.parts ?? []).some((p) => p.id === id)) id = `${base}-${n++}`;
        setDoc({ ...doc, parts: [...(doc.parts ?? []), { id, name }] });
      },
      updatePart: (id, patch) =>
        setDoc({
          ...doc,
          parts: doc.parts?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }),
      deletePart: (id) =>
        setDoc({
          ...doc,
          parts: doc.parts?.filter((p) => p.id !== id),
          steps: doc.steps.map((s) =>
            s.part === id ? { ...s, part: undefined } : s
          ),
        }),
      assignGroup: (stepId, groupId) => {
        let groups = (doc.groups ?? []).map((g) => ({
          ...g,
          steps: g.steps.filter((s) => s !== stepId),
        }));
        if (groupId === "__new__") {
          let n = groups.length + 1;
          while (groups.some((g) => g.id === `group-${n}`)) n++;
          groups.push({ id: `group-${n}`, label: `Group ${n}`, steps: [stepId] });
        } else if (groupId) {
          groups = groups.map((g) =>
            g.id === groupId ? { ...g, steps: [...g.steps, stepId] } : g
          );
        }
        setDoc({
          ...doc,
          groups: groups.filter((g) => g.steps.length > 0).length
            ? groups.filter((g) => g.steps.length > 0)
            : undefined,
        });
      },
      updateGroup: (id, patch) =>
        setDoc({
          ...doc,
          groups: doc.groups?.map((g) =>
            g.id === id ? { ...g, ...patch } : g
          ),
        }),
      deleteGroup: (id) => {
        const groups = doc.groups?.filter((g) => g.id !== id);
        setDoc({ ...doc, groups: groups?.length ? groups : undefined });
      },
    }),
    [doc, setDoc, updateStep, deleteStep, deleteEdge, updateEdgeLabel, updateEdgeStyle]
  );

  /* -------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === "function" &&
        target.closest("input, textarea, select")
      )
        return;
      if (e.key === "Escape") {
        if (connectFrom) setConnectFrom(null);
        else setSelection(null);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selection &&
        !jsonOpen
      ) {
        e.preventDefault();
        if (selection.kind === "step") deleteStep(selection.id);
        else deleteEdge(selection.ref);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, connectFrom, jsonOpen, deleteStep, deleteEdge]);

  /* ---------------------------------------------------------- render */

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <Toolbar
        title={doc.title}
        isCustom={isCustom}
        onTitle={(title) => setDoc({ ...doc, title })}
        onAddStep={() => addStep()}
        onOpenJson={() => setJsonOpen(true)}
        onReset={() => {
          setDocState(normalize(SAMPLE));
          setIsCustom(false);
          setSelection(null);
          setConnectFrom(null);
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }}
      />
      <div className="relative min-h-0 flex-1">
        <Canvas
          doc={doc}
          positions={positions}
          selection={selection}
          connectFrom={connectFrom}
          onSelect={setSelection}
          onClearSelection={() => setSelection(null)}
          onMoveNode={moveNode}
          onStartConnect={setConnectFrom}
          onCompleteConnect={completeConnect}
          onCancelConnect={() => setConnectFrom(null)}
          onMenu={(target, x, y) => setMenu({ target, x, y })}
        />
        <Inspector doc={doc} selection={selection} actions={actions} />
        {menu && (
          <ContextMenu
            menu={menu}
            currentColor={
              menu.target.type === "tile"
                ? doc.steps.find((s) => s.id === (menu.target as { id: string }).id)
                    ?.color
                : undefined
            }
            canDelete={doc.steps.length > 1}
            onClose={() => setMenu(null)}
            onAddAfter={(id) => addStep({ afterId: id })}
            onAddAt={(cell) => addStep({ cell })}
            onConnect={(id) => setConnectFrom(id)}
            onColor={(id, color) => updateStep(id, { color })}
            onDeleteStep={deleteStep}
            onDeleteEdge={deleteEdge}
          />
        )}
      </div>
      <JsonDialog
        open={jsonOpen}
        doc={doc}
        onClose={() => setJsonOpen(false)}
        onApply={(data) => {
          setDoc(normalize(data));
          setSelection(null);
          setConnectFrom(null);
          setJsonOpen(false);
        }}
      />
    </div>
  );
}
