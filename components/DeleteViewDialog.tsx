"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  viewTitle: string;
  stepCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteViewDialog({
  open,
  viewTitle,
  stepCount,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel delete view"
        className="theme-overlay absolute inset-0 cursor-default backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="anim-pop material-panel relative w-full max-w-[420px] rounded-2xl border border-line-strong p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-rose/35 bg-rose/12 text-rose">
            <AlertTriangle size={16} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-text">
              Delete this view?
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
              This will remove{" "}
              <span className="font-medium text-text">{viewTitle}</span> and
              its {stepCount} step{stepCount === 1 ? "" : "s"}. You can undo
              afterward.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="material-control h-8 cursor-pointer rounded-lg border border-line-strong px-4 text-[12.5px] font-medium text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 cursor-pointer rounded-lg bg-rose px-4 text-[12.5px] font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            Delete view
          </button>
        </div>
      </div>
    </div>
  );
}
