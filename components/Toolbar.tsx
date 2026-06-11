"use client";

import { Braces, Plus, Undo2 } from "lucide-react";

interface Props {
  title: string;
  isCustom: boolean;
  onTitle: (title: string) => void;
  onAddStep: () => void;
  onOpenJson: () => void;
  onReset: () => void;
}

export function Toolbar({
  title,
  isCustom,
  onTitle,
  onAddStep,
  onOpenJson,
  onReset,
}: Props) {
  return (
    <header className="z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface/60 px-3.5 backdrop-blur-md">
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
        className="w-[200px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium text-text placeholder:text-faint hover:border-line focus:border-line-strong focus:outline-none md:w-[340px]"
        value={title}
        placeholder="How … works"
        onChange={(e) => onTitle(e.target.value)}
      />
      <span className="flex-1" />
      {isCustom && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-faint transition-colors hover:text-mute"
        >
          <Undo2 size={12} />
          Sample
        </button>
      )}
      <button
        type="button"
        onClick={onAddStep}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] text-mute transition-colors hover:border-line-strong hover:text-text"
      >
        <Plus size={13} />
        Step
      </button>
      <button
        type="button"
        onClick={onOpenJson}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/20"
      >
        <Braces size={13} />
        JSON
      </button>
    </header>
  );
}
