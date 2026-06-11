"use client";

import { Braces, Plus, Sparkles, Undo2, Wand2 } from "lucide-react";

interface Props {
  title: string;
  isCustom: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onTidy: () => void;
  onTitle: (title: string) => void;
  onAddStep: () => void;
  onOpenJson: () => void;
  onReset: () => void;
}

export function Toolbar({
  title,
  isCustom,
  canUndo,
  onUndo,
  onTidy,
  onTitle,
  onAddStep,
  onOpenJson,
  onReset,
}: Props) {
  return (
    <header className="z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line-strong bg-surface px-3.5">
      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M3 15 C 3 8, 15 10, 15 3"
          stroke="#8f8ffc"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="3" cy="15" r="2" fill="#8f8ffc" />
        <circle cx="15" cy="3" r="2" fill="#6cc7b2" />
      </svg>
      <input
        aria-label="Explanation title"
        className="w-[200px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13.5px] font-medium text-text placeholder:text-faint hover:border-line-strong focus:border-accent/50 focus:outline-none md:w-[340px]"
        value={title}
        placeholder="How … works"
        onChange={(e) => onTitle(e.target.value)}
      />
      <span className="flex-1" />
      {isCustom && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-mute transition-colors hover:text-text"
        >
          <Sparkles size={12} />
          Sample
        </button>
      )}
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
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-raise px-3 text-[12.5px] text-text/90 transition-colors hover:bg-tile"
      >
        <Wand2 size={13} />
        Tidy
      </button>
      <button
        type="button"
        onClick={onAddStep}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-raise px-3 text-[12.5px] text-text/90 transition-colors hover:bg-tile"
      >
        <Plus size={13} />
        Step
      </button>
      <button
        type="button"
        onClick={onOpenJson}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/25"
      >
        <Braces size={13} />
        JSON
      </button>
    </header>
  );
}
