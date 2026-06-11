"use client";

import { CornerDownRight, Link2, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Branch, Explanation, Group, Step, StepKind } from "@/lib/types";
import { KIND_META, STEP_PALETTE, partColors, withAlpha } from "@/lib/meta";
import { type EdgeRef, type Selection } from "@/lib/graph";

export interface EditorActions {
  updateDoc: (patch: Partial<Pick<Explanation, "title" | "summary">>) => void;
  updateStep: (id: string, patch: Partial<Step>) => void;
  deleteStep: (id: string) => void;
  startConnect: (id: string) => void;
  deleteEdge: (ref: EdgeRef) => void;
  updateEdgeLabel: (ref: EdgeRef, label: string) => void;
  addPart: (name: string) => void;
  updatePart: (id: string, patch: { name?: string; role?: string }) => void;
  deletePart: (id: string) => void;
  addLoop: (from: string, to: string) => void;
  /** groupId, existing group id, or "__new__"; null removes membership. */
  assignGroup: (stepId: string, groupId: string | null) => void;
  updateGroup: (id: string, patch: Partial<Pick<Group, "label" | "color">>) => void;
  deleteGroup: (id: string) => void;
}

interface Props {
  doc: Explanation;
  selection: Selection | null;
  actions: EditorActions;
}

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-text placeholder:text-faint focus:border-accent/40 focus:outline-none";
const labelCls = "mb-1 mt-3.5 block text-[10px] uppercase tracking-[0.16em] text-faint";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function Inspector({ doc, selection, actions }: Props) {
  return (
    <aside className="absolute bottom-3 right-3 top-3 z-30 hidden w-[300px] flex-col overflow-y-auto rounded-xl border border-line bg-surface/90 p-4 backdrop-blur-md md:flex">
      {selection?.kind === "step" ? (
        <StepPanel
          doc={doc}
          step={doc.steps.find((s) => s.id === selection.id)}
          actions={actions}
        />
      ) : selection?.kind === "edge" ? (
        <EdgePanel doc={doc} edgeRef={selection.ref} actions={actions} />
      ) : (
        <DocPanel doc={doc} actions={actions} />
      )}
    </aside>
  );
}

/* ---------------------------------------------------------------- step */

function StepPanel({
  doc,
  step,
  actions,
}: {
  doc: Explanation;
  step?: Step;
  actions: EditorActions;
}) {
  if (!step) return null;
  const byId = new Map(doc.steps.map((s, i) => [s.id, { i, title: s.title }]));
  const stepIndex = byId.get(step.id)?.i ?? 0;
  const isBackward = (to: string) => (byId.get(to)?.i ?? Infinity) <= stepIndex;

  const setBranches = (branches: Branch[]) =>
    actions.updateStep(step.id, {
      branches: branches.length ? branches : undefined,
    });

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-faint">
          Step
        </span>
        <button
          type="button"
          title="Delete step"
          onClick={() => actions.deleteStep(step.id)}
          disabled={doc.steps.length <= 1}
          className="cursor-pointer rounded-md p-1.5 text-faint transition-colors hover:bg-rose/10 hover:text-rose disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <label className={labelCls} htmlFor="insp-title">
        Title
      </label>
      <input
        id="insp-title"
        className={inputCls}
        value={step.title}
        onChange={(e) => actions.updateStep(step.id, { title: e.target.value })}
      />

      <label className={labelCls} htmlFor="insp-kind">
        Kind
      </label>
      <select
        id="insp-kind"
        className={`${inputCls} cursor-pointer appearance-none`}
        value={step.kind ?? "process"}
        onChange={(e) =>
          actions.updateStep(step.id, { kind: e.target.value as StepKind })
        }
      >
        {Object.entries(KIND_META).map(([k, meta]) => (
          <option key={k} value={k}>
            {meta.label}
          </option>
        ))}
      </select>

      <span className={labelCls}>Color</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Kind default"
          aria-label="Reset to kind color"
          onClick={() => actions.updateStep(step.id, { color: undefined })}
          className={`size-4.5 cursor-pointer rounded-full border border-dashed border-line-strong transition-transform hover:scale-110 ${
            !step.color ? "ring-1 ring-text/60" : ""
          }`}
          style={{ background: withAlpha(KIND_META[step.kind ?? "process"].color, "33") }}
        />
        {STEP_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Set color ${c}`}
            onClick={() => actions.updateStep(step.id, { color: c })}
            className={`size-4.5 cursor-pointer rounded-full transition-transform hover:scale-110 ${
              step.color === c
                ? "ring-1 ring-text/70 ring-offset-2 ring-offset-surface"
                : ""
            }`}
            style={{ background: c }}
          />
        ))}
      </div>

      <label className={labelCls} htmlFor="insp-group">
        Group
      </label>
      <select
        id="insp-group"
        className={`${inputCls} cursor-pointer appearance-none`}
        value={doc.groups?.find((g) => g.steps.includes(step.id))?.id ?? ""}
        onChange={(e) => actions.assignGroup(step.id, e.target.value || null)}
      >
        <option value="">none</option>
        {(doc.groups ?? []).map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
        <option value="__new__">+ new group</option>
      </select>

      <label className={labelCls} htmlFor="insp-part">
        Moving part
      </label>
      <select
        id="insp-part"
        className={`${inputCls} cursor-pointer appearance-none`}
        value={step.part ?? ""}
        onChange={(e) =>
          actions.updateStep(step.id, { part: e.target.value || undefined })
        }
      >
        <option value="">none</option>
        {(doc.parts ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <label className={labelCls} htmlFor="insp-detail">
        Detail
      </label>
      <textarea
        id="insp-detail"
        className={`${inputCls} h-20 resize-none leading-relaxed`}
        value={step.detail ?? ""}
        placeholder="What happens here, and why it matters…"
        onChange={(e) =>
          actions.updateStep(step.id, { detail: e.target.value || undefined })
        }
      />

      <label className={labelCls} htmlFor="insp-in">
        Inputs <span className="normal-case tracking-normal">(comma-separated)</span>
      </label>
      <input
        id="insp-in"
        className={inputCls}
        value={(step.inputs ?? []).join(", ")}
        placeholder="question, context"
        onChange={(e) => {
          const arr = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          actions.updateStep(step.id, {
            inputs: arr.length ? arr : undefined,
          });
        }}
      />

      <label className={labelCls} htmlFor="insp-out">
        Outputs
      </label>
      <input
        id="insp-out"
        className={inputCls}
        value={(step.outputs ?? []).join(", ")}
        placeholder="draft answer"
        onChange={(e) => {
          const arr = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          actions.updateStep(step.id, {
            outputs: arr.length ? arr : undefined,
          });
        }}
      />

      <label className={labelCls} htmlFor="insp-note">
        Note
      </label>
      <input
        id="insp-note"
        className={inputCls}
        value={step.note ?? ""}
        placeholder="optional caveat"
        onChange={(e) =>
          actions.updateStep(step.id, { note: e.target.value || undefined })
        }
      />

      <span className={labelCls}>Connections</span>
      <div className="space-y-1.5">
        {step.then && (
          <div className="flex items-center gap-1.5 text-[11.5px]">
            {isBackward(step.then) ? (
              <RotateCcw size={11} className="shrink-0 text-amber" />
            ) : (
              <CornerDownRight size={11} className="shrink-0 text-faint" />
            )}
            <span className="flex-1 truncate text-mute">
              then → {truncate(byId.get(step.then)?.title ?? step.then, 24)}
            </span>
            <button
              type="button"
              aria-label="Remove connection"
              onClick={() => actions.deleteEdge({ type: "flow", from: step.id })}
              className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
        {(step.branches ?? []).map((b, bi) => (
          <div key={bi} className="flex items-center gap-1.5 text-[11.5px]">
            {isBackward(b.to) ? (
              <RotateCcw size={11} className="shrink-0 text-amber" />
            ) : (
              <CornerDownRight size={11} className="shrink-0 text-faint" />
            )}
            <input
              aria-label="Branch condition"
              className="w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] text-text focus:border-line focus:outline-none"
              value={b.when}
              onChange={(e) => {
                const next = [...(step.branches ?? [])];
                next[bi] = { ...next[bi], when: e.target.value };
                setBranches(next);
              }}
            />
            <span className="max-w-[80px] truncate text-faint">
              → {truncate(byId.get(b.to)?.title ?? b.to, 14)}
            </span>
            <button
              type="button"
              aria-label="Remove branch"
              onClick={() =>
                setBranches((step.branches ?? []).filter((_, i) => i !== bi))
              }
              className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {!step.then && !step.branches?.length && (
          <p className="text-[11.5px] text-faint">No outgoing connections.</p>
        )}
        <button
          type="button"
          onClick={() => actions.startConnect(step.id)}
          className="mt-1 flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-mute transition-colors hover:border-teal/40 hover:text-teal"
        >
          <Link2 size={11} />
          Connect to a step…
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- edge */

function EdgePanel({
  doc,
  edgeRef,
  actions,
}: {
  doc: Explanation;
  edgeRef: EdgeRef;
  actions: EditorActions;
}) {
  const byId = new Map(doc.steps.map((s) => [s.id, s.title]));
  let from = "";
  let to = "";
  let label: string | undefined;
  let kindLabel = "Sequence";

  if (edgeRef.type === "flow") {
    const s = doc.steps.find((x) => x.id === edgeRef.from);
    from = edgeRef.from;
    to = s?.then ?? "";
  } else if (edgeRef.type === "branch") {
    const s = doc.steps.find((x) => x.id === edgeRef.from);
    const b = s?.branches?.[edgeRef.index];
    from = edgeRef.from;
    to = b?.to ?? "";
    label = b?.when;
    kindLabel = "Branch";
  } else {
    const l = doc.loops?.[edgeRef.index];
    from = l?.from ?? "";
    to = l?.to ?? "";
    label = l?.label;
    kindLabel = "System loop";
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-faint">
          {kindLabel}
        </span>
        <button
          type="button"
          title="Delete connection"
          onClick={() => actions.deleteEdge(edgeRef)}
          className="cursor-pointer rounded-md p-1.5 text-faint transition-colors hover:bg-rose/10 hover:text-rose"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-mute">
        <span className="text-text">{truncate(byId.get(from) ?? from, 30)}</span>
        <span className="px-1.5 text-faint">→</span>
        <span className="text-text">{truncate(byId.get(to) ?? to, 30)}</span>
      </p>

      {edgeRef.type !== "flow" && (
        <>
          <label className={labelCls} htmlFor="insp-edge-label">
            {edgeRef.type === "branch" ? "Condition" : "What feeds back"}
          </label>
          <input
            id="insp-edge-label"
            className={inputCls}
            value={label ?? ""}
            placeholder={
              edgeRef.type === "branch" ? "when…" : "what changes over time…"
            }
            onChange={(e) => actions.updateEdgeLabel(edgeRef, e.target.value)}
          />
        </>
      )}

      {edgeRef.type === "flow" && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
          The default path the flow takes from this step.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- doc */

function DocPanel({
  doc,
  actions,
}: {
  doc: Explanation;
  actions: EditorActions;
}) {
  const colors = partColors(doc);
  const stepsById = new Map(doc.steps.map((s) => [s.id, s.title]));

  return (
    <div>
      <span className="text-[10px] uppercase tracking-[0.2em] text-faint">
        Explanation
      </span>

      <label className={labelCls} htmlFor="insp-summary">
        Summary
      </label>
      <textarea
        id="insp-summary"
        className={`${inputCls} h-24 resize-none leading-relaxed`}
        value={doc.summary ?? ""}
        placeholder="The essence in one sentence…"
        onChange={(e) =>
          actions.updateDoc({ summary: e.target.value || undefined })
        }
      />

      <span className={labelCls}>Moving parts</span>
      <div className="space-y-1.5">
        {(doc.parts ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: colors.get(p.id) }}
            />
            <input
              aria-label="Part name"
              className="w-[88px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-medium text-text focus:border-line focus:outline-none"
              value={p.name}
              onChange={(e) =>
                actions.updatePart(p.id, { name: e.target.value })
              }
            />
            <input
              aria-label="Part role"
              className="w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] text-mute focus:border-line focus:outline-none"
              value={p.role ?? ""}
              placeholder="role…"
              onChange={(e) =>
                actions.updatePart(p.id, { role: e.target.value })
              }
            />
            <button
              type="button"
              aria-label={`Delete part ${p.name}`}
              onClick={() => actions.deletePart(p.id)}
              className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => actions.addPart("New part")}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-mute transition-colors hover:border-line-strong hover:text-text"
        >
          <Plus size={11} />
          Add part
        </button>
      </div>

      <span className={labelCls}>System loops</span>
      <div className="space-y-1.5">
        {(doc.loops ?? []).map((l, li) => (
          <div key={li} className="flex items-center gap-1.5 text-[11.5px]">
            <RotateCcw size={11} className="shrink-0 text-accent" />
            <span className="w-0 flex-1 truncate text-mute">
              {truncate(stepsById.get(l.from) ?? l.from, 14)} →{" "}
              {truncate(stepsById.get(l.to) ?? l.to, 14)}
            </span>
            <button
              type="button"
              aria-label="Delete loop"
              onClick={() => actions.deleteEdge({ type: "loop", index: li })}
              className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        <AddLoop doc={doc} onAdd={actions.addLoop} />
      </div>

      {(doc.groups?.length ?? 0) > 0 && (
        <>
          <span className={labelCls}>Groups</span>
          <div className="space-y-1.5">
            {(doc.groups ?? []).map((g) => {
              const color = g.color ?? "#9b9bff";
              const next =
                STEP_PALETTE[
                  (STEP_PALETTE.indexOf(color) + 1) % STEP_PALETTE.length
                ];
              return (
                <div key={g.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Change color"
                    aria-label={`Change color of ${g.label}`}
                    onClick={() => actions.updateGroup(g.id, { color: next })}
                    className="size-3.5 shrink-0 cursor-pointer rounded-md border border-dashed transition-transform hover:scale-110"
                    style={{
                      borderColor: color,
                      background: withAlpha(color, "26"),
                    }}
                  />
                  <input
                    aria-label="Group label"
                    className="w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-text focus:border-line focus:outline-none"
                    value={g.label}
                    onChange={(e) =>
                      actions.updateGroup(g.id, { label: e.target.value })
                    }
                  />
                  <span className="text-[10.5px] text-faint">
                    {g.steps.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete group ${g.label}`}
                    onClick={() => actions.deleteGroup(g.id)}
                    className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AddLoop({
  doc,
  onAdd,
}: {
  doc: Explanation;
  onAdd: (from: string, to: string) => void;
}) {
  if (doc.steps.length < 2) return null;
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const from = String(fd.get("from"));
        const to = String(fd.get("to"));
        if (from && to && from !== to) onAdd(from, to);
      }}
    >
      <select
        name="from"
        aria-label="Loop from"
        className="w-0 flex-1 cursor-pointer appearance-none rounded-lg border border-line bg-bg px-1.5 py-1 text-[11px] text-mute focus:border-accent/40 focus:outline-none"
        defaultValue={doc.steps[doc.steps.length - 1].id}
      >
        {doc.steps.map((s) => (
          <option key={s.id} value={s.id}>
            {truncate(s.title, 22)}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-faint">→</span>
      <select
        name="to"
        aria-label="Loop to"
        className="w-0 flex-1 cursor-pointer appearance-none rounded-lg border border-line bg-bg px-1.5 py-1 text-[11px] text-mute focus:border-accent/40 focus:outline-none"
        defaultValue={doc.steps[0].id}
      >
        {doc.steps.map((s) => (
          <option key={s.id} value={s.id}>
            {truncate(s.title, 22)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        aria-label="Add loop"
        className="cursor-pointer rounded-md border border-line p-1.5 text-mute transition-colors hover:border-accent/40 hover:text-accent"
      >
        <Plus size={11} />
      </button>
    </form>
  );
}
