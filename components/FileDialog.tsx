"use client";

import { useEffect, useRef } from "react";
import { CircleAlert, FileJson, RefreshCw, Save, X } from "lucide-react";

export type FileSyncStatus =
  | "idle"
  | "loading"
  | "watching"
  | "saving"
  | "saved"
  | "external"
  | "error";

interface Props {
  open: boolean;
  path: string;
  status: FileSyncStatus;
  error: string | null;
  lastSyncedAt: number | null;
  onPathChange: (path: string) => void;
  onOpenPath: () => void;
  onSaveNow: () => void;
  onClose: () => void;
}

const EXAMPLE_PATH = "examples\\live-flow.json";

function statusText(status: FileSyncStatus, lastSyncedAt: number | null) {
  if (status === "loading") return "Loading file...";
  if (status === "saving") return "Saving changes...";
  if (status === "saved") return "Saved to disk";
  if (status === "external") return "Reloaded from disk";
  if (status === "error") return "Needs attention";
  if (lastSyncedAt)
    return `Watching - ${new Date(lastSyncedAt).toLocaleTimeString()}`;
  return "Choose a JSON file";
}

export function FileDialog({
  open,
  path,
  status,
  error,
  lastSyncedAt,
  onPathChange,
  onOpenPath,
  onSaveNow,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const busy = status === "loading" || status === "saving";

  return (
    <div
      className="anim-appear fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ animationDuration: "0.18s" }}
      role="dialog"
      aria-modal="true"
      aria-label="Local JSON file"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="anim-pop relative w-full max-w-[620px] rounded-2xl border border-line-strong bg-raise p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-medium">Local JSON File</h2>
            <p className="mt-0.5 text-[12px] text-mute">
              Bind the graph to a file on this machine and keep edits in sync.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="cursor-pointer rounded-full p-1.5 text-faint transition-colors hover:bg-line hover:text-text"
          >
            <X size={15} />
          </button>
        </div>

        <label className="mt-5 block text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          File path
        </label>
        <div className="mt-2 flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-well px-3 py-2 focus-within:border-accent/60">
            <FileJson size={14} className="shrink-0 text-accent" />
            <input
              ref={inputRef}
              aria-label="File path"
              value={path}
              onChange={(e) => onPathChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpenPath();
              }}
              spellCheck={false}
              placeholder={EXAMPLE_PATH}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-text placeholder:text-faint focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onOpenPath}
            disabled={busy}
            className="h-9 cursor-pointer rounded-lg bg-accent px-4 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] text-mute">
          <RefreshCw
            size={13}
            className={
              status === "loading" || status === "saving"
                ? "animate-spin text-accent"
                : "text-teal"
            }
          />
          <span>{statusText(status, lastSyncedAt)}</span>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-rose">
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveNow}
            disabled={busy}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-mute transition-colors hover:border-line-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={12} />
            Save now
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12.5px] text-mute transition-colors hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
