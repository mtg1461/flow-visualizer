"use client";

import type { Step } from "@/lib/types";
import { kindMeta, resolveGraphColor, withAlpha } from "@/lib/meta";
import { NODE_H, NODE_W } from "@/lib/graph";
import { useTheme } from "@/hooks/useTheme";

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
  const { resolvedTheme } = useTheme();
  const kind = kindMeta(step.kind ?? "process", resolvedTheme);
  const accent = step.color
    ? resolveGraphColor(step.color, resolvedTheme)
    : kind.color;
  const connectColor = resolveGraphColor("#7fd6c2", resolvedTheme);
  const actorDot = actorColor ?? resolveGraphColor("#9b9bff", resolvedTheme);
  const lightMode = resolvedTheme === "light";
  const bodyTint = lightMode ? "08" : "0d";
  const headerTintTop = lightMode ? "36" : "22";
  const headerTintBottom = lightMode ? "20" : "10";
  const headerDivider = lightMode ? "52" : "28";

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
            ? connectColor
            : "var(--app-node-border)",
        background: `linear-gradient(180deg, ${withAlpha(
          accent,
          bodyTint
        )} 0%, var(--app-node-body-hi) 34%, var(--app-node-body-lo) 100%)`,
        boxShadow: `${
          selected
            ? `0 0 0 3px ${withAlpha(accent, "42")}, 0 0 26px ${withAlpha(accent, "20")}, `
            : ""
        }inset 0 1px 0 var(--app-inset)${
          dragging
            ? ", 0 24px 58px var(--app-node-drag-shadow)"
            : ", 0 12px 34px var(--app-node-shadow)"
        }`,
      }}
      className={`group absolute select-none rounded-lg border hover:border-line-strong ${
        dragging
          ? "z-20 scale-[1.015] transition-none"
          : "transition-[left,top,border-color,box-shadow,transform,opacity] duration-200 ease-out hover:-translate-y-0.5"
      } ${connectTarget ? "cursor-crosshair" : "cursor-pointer"}`}
    >
      <div
        className="flex items-center gap-1.5 rounded-t-[7px] px-3.5 pb-1.5 pt-2.5"
        style={{
          background: `linear-gradient(180deg, ${withAlpha(
            accent,
            headerTintTop
          )}, ${withAlpha(accent, headerTintBottom)})`,
          borderBottom: `1px solid ${withAlpha(accent, headerDivider)}`,
          boxShadow: lightMode
            ? `inset 0 1px 0 rgba(255,255,255,0.78), 0 1px 0 ${withAlpha(
                accent,
                "10"
              )}`
            : "inset 0 1px 0 var(--app-inset)",
        }}
      >
        <span
          className="text-[10px] font-extrabold uppercase tracking-[0.16em]"
          style={{ color: accent }}
        >
          {kind.label}
        </span>
        <span className="flex-1" />
        {actorName && (
          <span className="theme-inset flex min-w-0 items-center gap-1.5 rounded-full border border-line px-1.5 py-0.5 text-[10.5px] text-text">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{
                background: actorDot,
                boxShadow: `0 0 8px ${actorDot}80`,
              }}
            />
            <span className="truncate">{actorName}</span>
          </span>
        )}
      </div>

      <h3 className="line-clamp-2 px-3.5 pt-2.5 text-[13.5px] font-semibold leading-snug text-text">
        {step.title}
      </h3>

      {/* connect port */}
      <button
        type="button"
        title={connectTarget ? "Connect to this step" : "Connect to another step"}
        aria-label={
          connectTarget ? `Connect to ${step.title}` : `Connect from ${step.title}`
        }
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onPortClick();
        }}
        className={`absolute -bottom-[14px] left-1/2 -translate-x-1/2 cursor-pointer p-1.5 transition-opacity ${
          selected || connectSource || connectTarget
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
