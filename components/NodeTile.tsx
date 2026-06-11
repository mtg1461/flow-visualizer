"use client";

import type { Step } from "@/lib/types";
import { KIND_META, withAlpha } from "@/lib/meta";
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
  onContextMenu: (e: React.MouseEvent) => void;
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
  onContextMenu,
  onPortClick,
}: Props) {
  const kind = KIND_META[step.kind ?? "process"];
  const accent = step.color ?? kind.color;

  return (
    <div
      data-node-id={step.id}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      title={step.detail}
      style={{
        left: x,
        top: y,
        width: NODE_W,
        height: NODE_H,
        borderColor: selected
          ? withAlpha(accent, "cc")
          : connectSource
            ? "rgba(127,214,194,0.8)"
            : "rgba(255,255,255,0.16)",
        boxShadow: `inset 3px 0 0 ${accent}${
          selected ? `, 0 0 0 3px ${withAlpha(accent, "2e")}` : ""
        }${dragging ? ", 0 16px 40px rgba(0,0,0,0.6)" : ", 0 4px 16px rgba(0,0,0,0.35)"}`,
      }}
      className={`group absolute select-none rounded-lg border bg-tile px-3.5 py-2.5 transition-[border-color,box-shadow] duration-150 hover:border-line-strong ${
        dragging ? "z-20" : ""
      } ${connectTarget ? "cursor-crosshair" : "cursor-default"}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9.5px] font-medium uppercase tracking-[0.15em]"
          style={{ color: accent }}
        >
          {kind.label}
        </span>
        <span className="flex-1" />
        {partName && (
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-mute">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: partColor ?? "#9b9bff" }}
            />
            <span className="truncate">{partName}</span>
          </span>
        )}
      </div>

      <h3 className="mt-1.5 line-clamp-2 text-[13.5px] font-medium leading-snug text-text">
        {step.title}
      </h3>

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
