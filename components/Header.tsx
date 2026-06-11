"use client";

import { ClipboardPaste, Undo2 } from "lucide-react";

interface Props {
  isCustom: boolean;
  onOpen: () => void;
  onReset: () => void;
}

export function Header({ isCustom, onOpen, onReset }: Props) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1060px] items-center justify-between px-5 md:px-6">
        <div className="flex items-center gap-2.5">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M3 15 C 3 8, 15 10, 15 3"
              stroke="#8f8ffc"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="3" cy="15" r="2" fill="#8f8ffc" />
            <circle cx="15" cy="3" r="2" fill="#6cc7b2" />
          </svg>
          <span className="font-serif text-[19px] italic tracking-wide">
            Unfold
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isCustom && (
            <button
              type="button"
              onClick={onReset}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] text-faint transition-colors hover:text-mute"
            >
              <Undo2 size={13} />
              Sample
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 text-[13px] font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <ClipboardPaste size={14} />
            Paste explanation
          </button>
        </div>
      </div>
    </header>
  );
}
