"use client";

import {
  ArrowDownToDot,
  ArrowUpFromDot,
  CornerDownRight,
  RotateCcw,
} from "lucide-react";
import type { Part, Step } from "@/lib/types";
import { KIND_META } from "@/lib/meta";

interface StepRef {
  index: number;
  title: string;
}

interface Props {
  step: Step;
  index: number;
  active: boolean;
  flash: boolean;
  partsById: Map<string, Part>;
  partColor?: string;
  byId: Map<string, StepRef>;
  onJump: (id: string) => void;
  refCb: (el: HTMLDivElement | null) => void;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function TargetChip({
  to,
  byId,
  onJump,
}: {
  to: string;
  byId: Map<string, StepRef>;
  onJump: (id: string) => void;
}) {
  const target = byId.get(to);
  if (!target) return null;
  return (
    <button
      type="button"
      onClick={() => onJump(to)}
      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-raise px-2 py-0.5 text-[11px] text-mute transition-colors hover:border-line-strong hover:text-text"
    >
      <span className="font-serif text-[12px] italic">{target.index + 1}</span>
      <span>·</span>
      <span>{truncate(target.title, 28)}</span>
    </button>
  );
}

export function StepCard({
  step,
  index,
  active,
  flash,
  partsById,
  partColor,
  byId,
  onJump,
  refCb,
}: Props) {
  const kind = KIND_META[step.kind ?? "process"];
  const part = step.part ? partsById.get(step.part) : undefined;
  const partName = part?.name ?? step.part;

  const isBackward = (to: string) =>
    (byId.get(to)?.index ?? Infinity) < index;

  return (
    <div
      ref={refCb}
      style={{ animationDelay: `${0.15 + Math.min(index * 0.08, 0.7)}s` }}
      className={`anim-rise relative rounded-2xl border bg-surface/80 px-5 py-4 backdrop-blur-sm transition-shadow duration-500 md:px-6 md:py-5 ${
        active ? "border-line-strong" : "border-line"
      } ${flash ? "ring-2 ring-accent/40" : ""}`}
    >
      {/* node on the spine */}
      <span
        aria-hidden
        className="absolute -left-[37px] top-[18px] size-2.5 rounded-full transition-all duration-500"
        style={{
          background: kind.color,
          boxShadow: active
            ? `0 0 0 4px ${kind.color}26, 0 0 18px ${kind.color}80`
            : `0 0 0 3px #0a0a0f`,
          transform: active ? "scale(1.25)" : undefined,
        }}
      />

      <div className="flex items-baseline gap-3">
        <span className="font-serif text-[17px] italic leading-none text-faint">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]"
          style={{ color: kind.color }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: kind.color }}
          />
          {kind.label}
        </span>
        <span className="flex-1" />
        {partName && (
          <span className="flex items-center gap-1.5 text-[11.5px] text-mute">
            <span
              className="size-1.5 rounded-full"
              style={{ background: partColor ?? "#8f8ffc" }}
            />
            {partName}
          </span>
        )}
      </div>

      <h3 className="mt-2.5 text-[16.5px] font-medium tracking-[-0.01em] text-text">
        {step.title}
      </h3>
      {step.detail && (
        <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-mute">
          {step.detail}
        </p>
      )}

      {(step.inputs?.length || step.outputs?.length) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {step.inputs?.map((label) => (
            <span
              key={`in-${label}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-teal/20 bg-teal/[0.07] px-2.5 py-1 text-[11.5px] text-teal"
            >
              <ArrowDownToDot size={11} strokeWidth={2.2} />
              {label}
            </span>
          ))}
          {step.outputs?.map((label) => (
            <span
              key={`out-${label}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose/20 bg-rose/[0.07] px-2.5 py-1 text-[11.5px] text-rose"
            >
              <ArrowUpFromDot size={11} strokeWidth={2.2} />
              {label}
            </span>
          ))}
        </div>
      )}

      {step.branches && step.branches.length > 0 && (
        <div className="mt-3.5 space-y-2 border-t border-line pt-3">
          {step.branches.map((b) => (
            <div
              key={`${b.when}-${b.to}`}
              className="flex flex-wrap items-center gap-2 text-[12.5px]"
            >
              {isBackward(b.to) ? (
                <RotateCcw size={12} className="shrink-0 text-amber" />
              ) : (
                <CornerDownRight size={12} className="shrink-0 text-faint" />
              )}
              <span className="text-text/85">{b.when}</span>
              <TargetChip to={b.to} byId={byId} onJump={onJump} />
            </div>
          ))}
        </div>
      )}

      {step.then && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          {isBackward(step.then) ? (
            <>
              <RotateCcw size={12} className="shrink-0 text-amber" />
              <span className="text-amber/90">loops back to</span>
            </>
          ) : (
            <>
              <CornerDownRight size={12} className="shrink-0 text-faint" />
              <span className="text-mute">continues at</span>
            </>
          )}
          <TargetChip to={step.then} byId={byId} onJump={onJump} />
        </div>
      )}

      {step.note && (
        <p className="mt-2.5 text-[12px] italic text-faint">{step.note}</p>
      )}
    </div>
  );
}
