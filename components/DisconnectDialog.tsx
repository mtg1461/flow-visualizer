"use client";

import { Unplug, X } from "lucide-react";

interface Props {
  open: boolean;
  connectionName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DisconnectDialog({
  open,
  connectionName,
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
      aria-label="Disconnect file"
    >
      <button
        type="button"
        aria-label="Cancel disconnect"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="anim-pop relative w-full max-w-[420px] rounded-2xl border border-line-strong bg-raise p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose/30 bg-rose/10 text-rose">
              <Unplug size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-medium">Disconnect file?</h2>
              <p className="mt-1 break-all text-[12.5px] leading-relaxed text-mute">
                {connectionName}
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
            className="h-8 cursor-pointer rounded-lg bg-rose px-4 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
