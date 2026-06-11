"use client";

import type { Step } from "@/lib/types";
import { KIND_META } from "@/lib/meta";
import { NODE_H, NODE_W } from "@/lib/graph";

interface Props {
  step: Step;
  x: number;
  y: number;
  selected: boolean;
  connectSource: boolean;
  connectTarget: boolean;
  dragging: boolean;
  partName?: string;
  partColor?: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onPortClick: () => void;
}

export function NodeTile({
  step,
  x,
  y,
  selected,
  connectSource,
  connectTarget,
  dragging,
  partName,
  partColor,
  onPointerDown,
  onPortClick,
}: Props) {
  const kind = KIND_META[step.kind ?? "process"];

  return (
    <div
      data-node-id={step.id}
      onPointerDown={onPointerDown}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      className={`group absolute select-none rounded-xl border bg-surface px-3.5 py-3 transition-shadow ${
        dragging
          ? "z-20 shadow-2xl shadow-black/60"
          : "shadow-lg shadow-black/25"
      } ${
        selected
          ? "border-accent/60 ring-2 ring-accent/20"
          : connectSource
            ? "border-teal/60 ring-2 ring-teal/20"
            : "border-line-strong/80 hover:border-line-strong"
      } ${connectTarget ? "cursor-crosshair hover:border-teal/60 hover:ring-2 hover:ring-teal/20" : "cursor-default"}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="size-1.5 rounded-full"
          style={{ background: kind.color }}
        />
        <span
          className="text-[9.5px] uppercase tracking-[0.14em]"
          style={{ color: kind.color }}
        >
          {kind.label}
        </span>
        <span className="flex-1" />
        {partName && (
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-mute">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: partColor ?? "#8f8ffc" }}
            />
            <span className="truncate">{partName}</span>
          </span>
        )}
      </div>

      <h3 className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug text-text">
        {step.title}
      </h3>
      {step.detail && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-mute">
          {step.detail}
        </p>
      )}

      {(step.inputs?.length || step.outputs?.length) && (
        <div className="absolute inset-x-3.5 bottom-2.5 flex gap-2 overflow-hidden text-[9.5px] leading-4">
          {step.inputs?.length ? (
            <span className="truncate text-teal/80">
              in&ensp;{step.inputs.join(" · ")}
            </span>
          ) : null}
          {step.outputs?.length ? (
            <span className="truncate text-rose/80">
              out&ensp;{step.outputs.join(" · ")}
            </span>
          ) : null}
        </div>
      )}

      {/* connect port */}
      <button
        type="button"
        title="Connect to another step"
        aria-label={`Connect from ${step.title}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onPortClick();
        }}
        className={`absolute -bottom-[13px] left-1/2 -translate-x-1/2 cursor-pointer p-1.5 transition-opacity ${
          selected || connectSource
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <span
          className={`block size-3 rounded-full border-2 bg-bg transition-colors ${
            connectSource ? "border-teal" : "border-accent hover:border-teal"
          }`}
        />
      </button>
    </div>
  );
}
