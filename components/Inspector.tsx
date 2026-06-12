"use client";

import {
  ChevronDown,
  CornerDownRight,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type {
  Branch,
  EdgeLine,
  Explanation,
  Group,
  Step,
  StepKind,
} from "@/lib/types";
import { KIND_META, STEP_PALETTE, actorColors, withAlpha } from "@/lib/meta";
import { type EdgeRef, type Selection } from "@/lib/graph";

export interface EditorActions {
  updateDoc: (patch: Partial<Pick<Explanation, "title" | "summary">>) => void;
  updateStep: (id: string, patch: Partial<Step>) => void;
  deleteStep: (id: string) => void;
  startConnect: (id: string) => void;
  deleteEdge: (ref: EdgeRef) => void;
  updateEdgeLabel: (ref: EdgeRef, label: string) => void;
  updateEdgeStyle: (
    ref: EdgeRef,
    patch: { color?: string | null; line?: EdgeLine | null }
  ) => void;
  addActor: (name: string) => void;
  updateActor: (id: string, patch: { name?: string; role?: string }) => void;
  deleteActor: (id: string) => void;
  /** groupId, existing group id, or "__new__"; null removes membership. */
  assignGroup: (stepId: string, groupId: string | null) => void;
  updateGroup: (
    id: string,
    patch: Partial<Pick<Group, "label" | "color" | "grid">>
  ) => void;
  deleteGroup: (id: string) => void;
}

interface Props {
  doc: Explanation;
  selection: Selection | null;
  actions: EditorActions;
}

const inputCls =
  "w-full rounded-lg border border-line-strong bg-well px-2.5 py-1.5 text-[13px] text-text shadow-inner shadow-black/25 transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-faint hover:border-white/30 focus:border-accent/70 focus:bg-[#11131c] focus:outline-none focus:ring-2 focus:ring-accent/15";
const selectCls = `${inputCls} cursor-pointer appearance-none pr-8`;
const miniInputCls =
  "rounded-md border border-line-strong bg-well px-1.5 py-1 text-text shadow-inner shadow-black/20 transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-faint hover:border-white/30 focus:border-accent/70 focus:bg-[#11131c] focus:outline-none focus:ring-2 focus:ring-accent/15";
const labelCls =
  "mb-1.5 mt-3.5 block text-[10.5px] font-medium uppercase tracking-[0.16em] text-mute";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function Inspector({ doc, selection, actions }: Props) {
  const panelKey = selection
    ? selection.kind === "edge"
      ? `${selection.kind}:${JSON.stringify(selection.ref)}`
      : `${selection.kind}:${selection.id}`
    : "doc";

  return (
    <aside className="anim-inspector absolute bottom-3 right-3 top-3 z-30 hidden w-[304px] flex-col overflow-y-auto rounded-xl border border-line-strong bg-raise p-4 shadow-2xl shadow-black/40 md:flex">
      <div key={panelKey} className="anim-panel-change">
        {selection?.kind === "step" ? (
          <StepPanel
            doc={doc}
            step={doc.steps.find((s) => s.id === selection.id)}
            actions={actions}
          />
        ) : selection?.kind === "edge" ? (
          <EdgePanel doc={doc} edgeRef={selection.ref} actions={actions} />
        ) : selection?.kind === "group" ? (
          <GroupPanel
            doc={doc}
            group={doc.groups?.find((g) => g.id === selection.id)}
            actions={actions}
          />
        ) : (
          <DocPanel doc={doc} actions={actions} />
        )}
      </div>
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
        <span className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-mute">
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
        className={`${inputCls} text-[13.5px] font-medium`}
        value={step.title}
        onChange={(e) => actions.updateStep(step.id, { title: e.target.value })}
      />

      <label className={labelCls} htmlFor="insp-detail">
        Detail
      </label>
      <textarea
        id="insp-detail"
        className={`${inputCls} h-24 resize-none leading-relaxed`}
        value={step.detail ?? ""}
        placeholder="What happens here, and why it matters..."
        onChange={(e) =>
          actions.updateStep(step.id, { detail: e.target.value || undefined })
        }
      />

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

      <label className={labelCls} htmlFor="insp-kind">
        Kind
      </label>
      <div className="relative">
        <select
          id="insp-kind"
          className={selectCls}
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
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
        />
      </div>

      <label className={labelCls} htmlFor="insp-actor">
        Actor
      </label>
      <div className="relative">
        <select
          id="insp-actor"
          className={selectCls}
          value={step.actor ?? ""}
          onChange={(e) =>
            actions.updateStep(step.id, { actor: e.target.value || undefined })
          }
        >
          <option value="">none</option>
          {(doc.actors ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint"
        />
      </div>

      <span className={`${labelCls} border-t border-line pt-3`}>Connections</span>
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
              className={`${miniInputCls} w-0 flex-1 text-[12px]`}
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
          className="mx-auto mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-medium text-teal transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-teal/70 hover:bg-teal/15 active:translate-y-0"
        >
          <Link2 size={11} />
          Connect to a step…
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- edge */

const LINE_OPTIONS: { value: EdgeLine; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

function EdgePanel({
  doc,
  edgeRef,
  actions,
}: {
  doc: Explanation;
  edgeRef: EdgeRef;
  actions: EditorActions;
}) {
  const byId = new Map(doc.steps.map((s, i) => [s.id, { i, title: s.title }]));
  let from = "";
  let to = "";
  let label: string | undefined;
  let color: string | undefined;
  let line: EdgeLine | undefined;
  let kindLabel = "Connection";

  if (edgeRef.type === "flow") {
    const s = doc.steps.find((x) => x.id === edgeRef.from);
    from = edgeRef.from;
    to = s?.then ?? "";
    label = s?.thenLabel;
    color = s?.thenColor;
    line = s?.thenLine;
  } else if (edgeRef.type === "branch") {
    const s = doc.steps.find((x) => x.id === edgeRef.from);
    const b = s?.branches?.[edgeRef.index];
    from = edgeRef.from;
    to = b?.to ?? "";
    label = b?.when;
    color = b?.color;
    line = b?.line;
    kindLabel = "Branch";
  } else {
    const l = doc.loops?.[edgeRef.index];
    from = l?.from ?? "";
    to = l?.to ?? "";
    label = l?.label;
    color = l?.color;
    line = l?.line;
  }

  // the style the edge falls back to when nothing custom is set
  const backward =
    edgeRef.type === "loop" ||
    (byId.get(to)?.i ?? Infinity) <= (byId.get(from)?.i ?? 0);
  const effectiveLine: EdgeLine = line ?? (backward ? "dashed" : "solid");

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-mute">
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
        <span className="text-text">
          {truncate(byId.get(from)?.title ?? from, 30)}
        </span>
        <span className="px-1.5 text-faint">→</span>
        <span className="text-text">
          {truncate(byId.get(to)?.title ?? to, 30)}
        </span>
      </p>

      <label className={labelCls} htmlFor="insp-edge-label">
        {edgeRef.type === "branch" ? "Condition" : "Label"}
      </label>
      <input
        id="insp-edge-label"
        className={inputCls}
        value={label ?? ""}
        placeholder={edgeRef.type === "branch" ? "when…" : "optional label…"}
        onChange={(e) => actions.updateEdgeLabel(edgeRef, e.target.value)}
      />

      <span className={labelCls}>Line</span>
      <div className="flex gap-1">
        {LINE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => actions.updateEdgeStyle(edgeRef, { line: o.value })}
            className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-[11.5px] transition-colors ${
              effectiveLine === o.value
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-line bg-well text-mute hover:border-line-strong hover:text-text"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <span className={labelCls}>Color</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Default color"
          aria-label="Reset to default color"
          onClick={() => actions.updateEdgeStyle(edgeRef, { color: null })}
          className={`size-4.5 cursor-pointer rounded-full border border-dashed border-line-strong transition-transform hover:scale-110 ${
            !color ? "ring-1 ring-text/60" : ""
          }`}
        />
        {STEP_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Set edge color ${c}`}
            onClick={() => actions.updateEdgeStyle(edgeRef, { color: c })}
            className={`size-4.5 cursor-pointer rounded-full transition-transform hover:scale-110 ${
              color === c
                ? "ring-1 ring-text/70 ring-offset-2 ring-offset-raise"
                : ""
            }`}
            style={{ background: c }}
          />
        ))}
      </div>

      {(line || color) && (
        <button
          type="button"
          onClick={() =>
            actions.updateEdgeStyle(edgeRef, { line: null, color: null })
          }
          className="mt-4 cursor-pointer text-[11.5px] text-faint underline-offset-2 transition-colors hover:text-mute hover:underline"
        >
          Reset styling
        </button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- group */

function GroupPanel({
  doc,
  group,
  actions,
}: {
  doc: Explanation;
  group?: Group;
  actions: EditorActions;
}) {
  if (!group) return null;
  const titleOf = new Map(doc.steps.map((s) => [s.id, s.title]));
  const color = group.color ?? "#9b9bff";

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-mute">
          Group
        </span>
        <button
          type="button"
          title="Ungroup (steps stay)"
          onClick={() => actions.deleteGroup(group.id)}
          className="cursor-pointer rounded-md p-1.5 text-faint transition-colors hover:bg-rose/10 hover:text-rose"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <label className={labelCls} htmlFor="insp-group-label">
        Label
      </label>
      <input
        id="insp-group-label"
        className={inputCls}
        value={group.label}
        onChange={(e) => actions.updateGroup(group.id, { label: e.target.value })}
      />

      <span className={labelCls}>Color</span>
      <div className="flex items-center gap-1.5">
        {STEP_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Set group color ${c}`}
            onClick={() => actions.updateGroup(group.id, { color: c })}
            className={`size-4.5 cursor-pointer rounded-full transition-transform hover:scale-110 ${
              color === c
                ? "ring-1 ring-text/70 ring-offset-2 ring-offset-raise"
                : ""
            }`}
            style={{ background: c }}
          />
        ))}
      </div>

      <span className={labelCls}>
        Members <span className="normal-case tracking-normal">({group.steps.length})</span>
      </span>
      <div className="space-y-1">
        {group.steps.map((id) => (
          <div key={id} className="flex items-center gap-1.5 text-[12px]">
            <span className="w-0 flex-1 truncate text-text/85">
              {truncate(titleOf.get(id) ?? id, 32)}
            </span>
            <button
              type="button"
              aria-label={`Remove ${titleOf.get(id) ?? id} from group`}
              onClick={() => actions.assignGroup(id, null)}
              className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {group.steps.length === 0 && (
          <p className="text-[11.5px] leading-relaxed text-faint">
            Empty — drop tiles inside the region to add them.
          </p>
        )}
      </div>

      <p className="mt-5 border-t border-line pt-3.5 text-[11px] leading-relaxed text-faint">
        Drag the region to move it with its members — Alt-drag to move the
        box alone. Drag the corner handle to resize. Tiles dragged across the
        boundary join or leave; assignments made here always stick.
      </p>
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
  const colors = actorColors(doc);
  const actors = doc.actors ?? [];
  const groups = doc.groups ?? [];

  return (
    <div>
      <label className={`${labelCls} mt-0`} htmlFor="insp-summary">
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

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-mute">
          Actors
        </span>
        <button
          type="button"
          onClick={() => actions.addActor("New actor")}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[11.5px] text-mute transition-colors hover:border-line-strong hover:text-text"
        >
          <Plus size={11} />
          Add
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {actors.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-line bg-surface p-2"
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: colors.get(p.id),
                  boxShadow: `0 0 7px ${colors.get(p.id)}66`,
                }}
              />
              <input
                aria-label="Actor name"
                className={`${miniInputCls} min-w-0 text-[12.5px] font-medium`}
                value={p.name}
                onChange={(e) =>
                  actions.updateActor(p.id, { name: e.target.value })
                }
              />
              <button
                type="button"
                aria-label={`Delete actor ${p.name}`}
                onClick={() => actions.deleteActor(p.id)}
                className="cursor-pointer p-1 text-faint transition-colors hover:text-rose"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <input
              aria-label="Actor role"
              className={`${miniInputCls} mt-1.5 w-full text-[11.5px]`}
              value={p.role ?? ""}
              placeholder="role..."
              onChange={(e) =>
                actions.updateActor(p.id, { role: e.target.value })
              }
            />
          </div>
        ))}
        {actors.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-faint">
            No actors.
          </p>
        )}
      </div>

      {groups.length > 0 && (
        <div className="mt-5">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-mute">
            Groups
          </span>
          <div className="mt-2 space-y-2">
            {groups.map((g) => {
              const color = g.color ?? "#9b9bff";
              const next =
                STEP_PALETTE[
                  (STEP_PALETTE.indexOf(color) + 1) % STEP_PALETTE.length
                ];
              return (
                <div
                  key={g.id}
                  className="rounded-lg border border-line bg-surface p-2.5"
                >
                  <div className="flex items-center gap-2">
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
                      className={`${miniInputCls} min-w-0 flex-1 text-[12.5px]`}
                      value={g.label}
                      onChange={(e) =>
                        actions.updateGroup(g.id, { label: e.target.value })
                      }
                    />
                    <span className="rounded-md border border-line bg-well px-1.5 py-1 text-[10.5px] text-faint">
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
