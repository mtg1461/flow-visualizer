"use client";

import { RotateCcw, X } from "lucide-react";

interface Props {
  open: boolean;
  viewTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResetLayoutDialog({
  open,
  viewTitle,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="anim-appear fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ animationDuration: "0.18s" }}
      role="dialog"
      aria-modal="true"
      aria-label="Reset layout"
    >
      <button
        type="button"
        aria-label="Cancel reset layout"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="anim-pop material-panel relative w-full max-w-[420px] rounded-2xl border border-white/20 p-5 shadow-2xl shadow-black/55">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber/35 bg-amber/10 text-amber">
              <RotateCcw size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-medium">Reset layout?</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                This will discard saved positions for{" "}
                <span className="text-text">{viewTitle}</span> and reflow the
                view. You can undo afterward.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="cursor-pointer rounded-full p-1.5 text-faint transition-colors hover:bg-line hover:text-text"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12.5px] text-mute transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 cursor-pointer rounded-lg bg-amber px-4 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            Reset layout
          </button>
        </div>
      </div>
    </div>
  );
}
