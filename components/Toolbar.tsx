"use client";

import { Check, ClipboardCopy, Undo2, Unplug, Wand2 } from "lucide-react";
import type { FileSyncStatus } from "./ConnectionScreen";

interface Props {
  title: string;
  connectionName: string;
  status: FileSyncStatus;
  canUndo: boolean;
  onUndo: () => void;
  onTidy: () => void;
  onTitle: (title: string) => void;
  onCopyPrompt: () => void;
  promptCopied: boolean;
  onDisconnect: () => void;
}

export function Toolbar({
  title,
  connectionName,
  status,
  canUndo,
  onUndo,
  onTidy,
  onTitle,
  onCopyPrompt,
  promptCopied,
  onDisconnect,
}: Props) {
  const active = status === "watching" || status === "saved";
  const statusLabel =
    status === "saving"
      ? "Saving"
      : status === "external"
        ? "Reloaded"
        : status === "error"
          ? "Issue"
          : active
            ? "Connected"
            : "Connecting";

  return (
    <header className="anim-toolbar z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line-strong bg-surface px-3.5">
      <div className="flex min-w-0 max-w-[360px] items-center gap-2 rounded-lg border border-line bg-well px-2.5 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            status === "error"
              ? "bg-rose"
              : status === "saving"
                ? "bg-amber"
                : "bg-teal"
          }`}
        />
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          {statusLabel}
        </span>
        <span className="truncate font-mono text-[11.5px] text-mute">
          {connectionName}
        </span>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-raise px-2.5 text-[12px] text-text/90 transition-colors hover:bg-tile"
      >
        <Unplug size={12} />
        Disconnect
      </button>
      <input
        aria-label="Explanation title"
        className="w-[200px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13.5px] font-medium text-text placeholder:text-faint hover:border-line-strong focus:border-accent/50 focus:outline-none md:w-[340px]"
        value={title}
        placeholder="How … works"
        onChange={(e) => onTitle(e.target.value)}
      />
      <span className="flex-1" />
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-raise text-text/90 transition-colors hover:bg-tile disabled:cursor-not-allowed disabled:opacity-35"
      >
        <Undo2 size={13} />
      </button>
      <button
        type="button"
        title="Re-run the automatic layout"
        onClick={onTidy}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-raise px-3 text-[12.5px] text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-tile active:translate-y-0"
      >
        <Wand2 size={13} />
        Tidy
      </button>
      <button
        type="button"
        onClick={onCopyPrompt}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 text-[12.5px] font-medium text-accent transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-accent/25 active:translate-y-0"
      >
        {promptCopied ? (
          <Check size={13} className="text-teal" />
        ) : (
          <ClipboardCopy size={13} />
        )}
        {promptCopied ? "Copied" : "Copy Prompt"}
      </button>
    </header>
  );
}
