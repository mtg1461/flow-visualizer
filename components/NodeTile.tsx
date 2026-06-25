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
  actorName?: string;
  actorColor?: string;
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
  actorName,
  actorColor,
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
          ? accent
          : connectSource
            ? "#7fd6c2"
            : "rgba(255,255,255,0.28)",
        background: `linear-gradient(180deg, ${withAlpha(
          accent,
          "0d"
        )} 0%, rgba(43,46,65,0.98) 34%, rgba(27,30,45,0.98) 100%)`,
        boxShadow: `${
          selected
            ? `0 0 0 3px ${withAlpha(accent, "42")}, 0 0 26px ${withAlpha(accent, "20")}, `
            : ""
        }inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.35)${
          dragging
            ? ", 0 24px 58px rgba(0,0,0,0.72)"
            : ", 0 12px 34px rgba(0,0,0,0.52)"
        }`,
      }}
      className={`group absolute overflow-hidden select-none rounded-lg border hover:border-line-strong ${
        dragging
          ? "z-20 scale-[1.015] transition-none"
          : "transition-[left,top,border-color,box-shadow,transform,opacity] duration-200 ease-out hover:-translate-y-0.5"
      } ${connectTarget ? "cursor-crosshair" : "cursor-pointer"}`}
    >
      <div
        className="flex items-center gap-1.5 px-3.5 pb-1.5 pt-2.5"
        style={{
          background: `linear-gradient(180deg, ${withAlpha(
            accent,
            "22"
          )}, ${withAlpha(accent, "10")})`,
          borderBottom: `1px solid ${withAlpha(accent, "28")}`,
        }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-[0.15em]"
          style={{ color: accent }}
        >
          {kind.label}
        </span>
        <span className="flex-1" />
        {actorName && (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10.5px] text-[#dfe1ee]">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{
                background: actorColor ?? "#9b9bff",
                boxShadow: `0 0 8px ${actorColor ?? "#9b9bff"}80`,
              }}
            />
            <span className="truncate">{actorName}</span>
          </span>
        )}
      </div>

      <h3 className="line-clamp-2 px-3.5 pt-2.5 text-[13.5px] font-semibold leading-snug text-text drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]">
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
        className={`absolute -bottom-[14px] left-1/2 -translate-x-1/2 cursor-pointer p-1.5 transition-opacity ${
          selected || connectSource
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <span
          className={`block size-3.5 rounded-full border-2 bg-bg shadow-[0_0_14px_rgba(155,155,255,0.32)] transition-colors ${
            connectSource ? "border-teal" : "border-accent hover:border-teal"
          }`}
        />
      </button>
    </div>
  );
}
