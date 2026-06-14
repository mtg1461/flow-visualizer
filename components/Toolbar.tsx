"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  Group,
  Plus,
  Undo2,
  Unplug,
  Wand2,
} from "lucide-react";
import type { FileSyncStatus } from "./ConnectionScreen";

interface ViewOption {
  id: string;
  title: string;
  summary?: string;
  stepCount: number;
}

interface Props {
  views: ViewOption[];
  activeViewId: string;
  connectionName: string;
  status: FileSyncStatus;
  canUndo: boolean;
  onUndo: () => void;
  onAddStep: () => void;
  onAddGroup: () => void;
  onAddView: () => void;
  onViewSelect: (id: string) => void;
  onTidy: () => void;
  onAgentPrompt: () => void;
  onDisconnect: () => void;
}

export function Toolbar({
  views,
  activeViewId,
  connectionName,
  status,
  canUndo,
  onUndo,
  onAddStep,
  onAddGroup,
  onAddView,
  onViewSelect,
  onTidy,
  onAgentPrompt,
  onDisconnect,
}: Props) {
  const [open, setOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0];
  const active = status === "watching" || status === "saved";
  const statusLabel =
    status === "example"
      ? "Example"
      : status === "saving"
        ? "Saving"
        : status === "external"
          ? "Reloaded"
          : status === "error"
            ? "Issue"
            : active
              ? "Connected"
              : "Connecting";

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="anim-toolbar z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line-strong bg-surface px-3.5">
      <div ref={switcherRef} className="relative">
        <button
          type="button"
          title="Switch flow view"
          aria-label="Switch flow view"
          onClick={() => setOpen((value) => !value)}
          className="flex h-8 min-w-[220px] max-w-[320px] cursor-pointer items-center gap-2 rounded-lg border border-accent/35 bg-accent/15 px-2.5 text-left text-text transition-colors hover:bg-accent/25"
        >
          <GitBranch size={13} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {activeView?.title ?? "Untitled view"}
          </span>
          <ChevronDown
            size={13}
            className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="anim-pop absolute left-0 top-10 z-50 w-[340px] rounded-xl border border-line-strong bg-raise p-1.5 shadow-2xl shadow-black/45">
            <div className="mb-1 flex items-center justify-between border-b border-line px-2 py-1.5">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-faint">
                Views
              </span>
              <button
                type="button"
                title="Add view"
                aria-label="Add view"
                onClick={() => {
                  onAddView();
                  setOpen(false);
                }}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md border border-line bg-well text-mute transition-colors hover:border-accent/50 hover:text-accent"
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {views.map((view) => {
                const selected = view.id === activeViewId;
                return (
                  <button
                    key={view.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onViewSelect(view.id);
                      setOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      selected
                        ? "bg-accent/15 text-text"
                        : "text-mute hover:bg-line hover:text-text"
                    }`}
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-accent">
                      {selected ? <Check size={13} /> : <GitBranch size={13} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {view.title}
                      </span>
                      {view.summary && (
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-faint">
                          {view.summary}
                        </span>
                      )}
                      <span className="mt-1 block text-[10.5px] uppercase tracking-[0.12em] text-faint">
                        {view.stepCount} steps
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex min-w-0 max-w-[360px] items-center gap-2 rounded-lg border border-line bg-well px-2.5 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            status === "error"
              ? "bg-rose"
              : status === "saving"
                ? "bg-amber"
                : status === "example"
                  ? "bg-accent"
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
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Add step"
          aria-label="Add step"
          onClick={onAddStep}
          className="flex h-8 w-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raise text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-tile active:translate-y-0 md:w-auto md:px-3"
        >
          <Plus size={13} />
          <span className="hidden text-[12.5px] md:inline">Step</span>
        </button>
        <button
          type="button"
          title="Add group"
          aria-label="Add group"
          onClick={onAddGroup}
          className="flex h-8 w-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raise text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-tile active:translate-y-0 md:w-auto md:px-3"
        >
          <Group size={13} />
          <span className="hidden text-[12.5px] md:inline">Group</span>
        </button>
      </div>
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
        onClick={onAgentPrompt}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 text-[12.5px] font-medium text-accent transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-accent/25 active:translate-y-0"
      >
        <Bot size={13} />
        Agent Prompt
      </button>
    </header>
  );
}
