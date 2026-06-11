"use client";

import { useEffect, useRef } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { STEP_PALETTE } from "@/lib/meta";
import type { EdgeRef, Pos } from "@/lib/graph";

export type MenuTarget =
  | { type: "tile"; id: string }
  | { type: "canvas"; cell: Pos }
  | { type: "edge"; ref: EdgeRef };

export interface MenuState {
  x: number;
  y: number;
  target: MenuTarget;
}

interface Props {
  menu: MenuState;
  currentColor?: string;
  canDelete: boolean;
  onClose: () => void;
  onAddAfter: (id: string) => void;
  onAddAt: (cell: Pos) => void;
  onConnect: (id: string) => void;
  onColor: (id: string, color?: string) => void;
  onDeleteStep: (id: string) => void;
  onDeleteEdge: (ref: EdgeRef) => void;
}

const itemCls =
  "flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-mute transition-colors hover:bg-line hover:text-text";

export function ContextMenu({
  menu,
  currentColor,
  canDelete,
  onClose,
  onAddAfter,
  onAddAt,
  onConnect,
  onColor,
  onDeleteStep,
  onDeleteEdge,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const { target } = menu;
  const x = Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 200);
  const y = Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 220);

  return (
    <div
      ref={ref}
      role="menu"
      className="anim-pop fixed z-50 w-[184px] rounded-xl border border-line-strong bg-raise py-1.5 shadow-2xl shadow-black/50"
      style={{ left: x, top: y, animationDuration: "0.12s" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {target.type === "tile" && (
        <>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              onAddAfter(target.id);
              onClose();
            }}
          >
            <Plus size={13} className="text-faint" />
            Add step after
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              onConnect(target.id);
              onClose();
            }}
          >
            <Link2 size={13} className="text-faint" />
            Connect from here
          </button>
          <div className="mx-3 my-1.5 flex items-center gap-1.5 border-t border-line pt-2">
            <button
              type="button"
              title="Default color"
              aria-label="Reset to kind color"
              onClick={() => {
                onColor(target.id, undefined);
                onClose();
              }}
              className={`size-4 cursor-pointer rounded-full border border-dashed border-line-strong transition-transform hover:scale-110 ${
                !currentColor ? "ring-1 ring-text/50" : ""
              }`}
            />
            {STEP_PALETTE.slice(0, 6).map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={`Color ${c}`}
                onClick={() => {
                  onColor(target.id, c);
                  onClose();
                }}
                className={`size-4 cursor-pointer rounded-full transition-transform hover:scale-110 ${
                  currentColor === c ? "ring-1 ring-text/70 ring-offset-1 ring-offset-raise" : ""
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            disabled={!canDelete}
            className={`${itemCls} hover:bg-rose/10 hover:text-rose disabled:cursor-not-allowed disabled:opacity-40`}
            onClick={() => {
              onDeleteStep(target.id);
              onClose();
            }}
          >
            <Trash2 size={13} />
            Delete step
          </button>
        </>
      )}

      {target.type === "canvas" && (
        <button
          type="button"
          role="menuitem"
          className={itemCls}
          onClick={() => {
            onAddAt(target.cell);
            onClose();
          }}
        >
          <Plus size={13} className="text-faint" />
          Add step here
        </button>
      )}

      {target.type === "edge" && (
        <button
          type="button"
          role="menuitem"
          className={`${itemCls} hover:bg-rose/10 hover:text-rose`}
          onClick={() => {
            onDeleteEdge(target.ref);
            onClose();
          }}
        >
          <Trash2 size={13} />
          Delete connection
        </button>
      )}
    </div>
  );
}
