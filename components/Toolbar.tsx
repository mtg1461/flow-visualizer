"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  Plus,
  RotateCcw,
  Undo2,
  Unplug,
  Wand2,
} from "lucide-react";
import type { FileSyncStatus } from "./ConnectionScreen";
import { ThemeSwitcher } from "./ThemeSwitcher";

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
  lastSavedAt: number | null;
  canUndo: boolean;
  onUndo: () => void;
  onAddStep: () => void;
  onAddGroup: () => void;
  onAddView: () => void;
  onViewSelect: (id: string) => void;
  onTidy: () => void;
  onResetLayout: () => void;
  onAgentPrompt: () => void;
  onDisconnect: () => void;
}

export function Toolbar({
  views,
  activeViewId,
  connectionName,
  status,
  lastSavedAt,
  canUndo,
  onUndo,
  onAddStep,
  onAddGroup,
  onAddView,
  onViewSelect,
  onTidy,
  onResetLayout,
  onAgentPrompt,
  onDisconnect,
}: Props) {
  const [open, setOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const activeView = views.find((view) => view.id === activeViewId) ?? views[0];
  const connected =
    status === "watching" || status === "saving" || status === "saved";
  const statusLabel =
    status === "example"
      ? "Example"
      : status === "external"
          ? "Reloaded"
          : status === "error"
            ? "Issue"
            : connected
              ? "Connected"
              : "Connecting";
  const autoSaveLabel =
    status === "example"
      ? "Example not saved"
      : status === "saving"
        ? "Saving..."
        : lastSavedAt
          ? `Auto saved ${new Date(lastSavedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : status === "error"
            ? "Save issue"
            : "Auto save ready";

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
    <header className="anim-toolbar material-bar z-40 flex h-12 shrink-0 items-center gap-3 border-b border-line px-3.5 backdrop-blur-md">
      <div ref={switcherRef} className="relative">
        <button
          type="button"
          title="Switch flow view"
          aria-label="Switch flow view"
          onClick={() => setOpen((value) => !value)}
          className="flex h-8 min-w-[220px] max-w-[320px] cursor-pointer items-center gap-2 rounded-lg border border-accent/55 bg-accent/20 px-2.5 text-left text-text shadow-[0_0_22px_rgba(155,155,255,0.13)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent/80 hover:bg-accent/30 hover:shadow-[0_0_28px_rgba(155,155,255,0.22)] active:translate-y-0"
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
          <div className="anim-pop material-panel absolute left-0 top-10 z-50 w-[340px] rounded-xl border border-line-strong p-1.5">
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
                className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-accent/70 bg-accent text-on-accent shadow-[0_0_18px_rgba(155,155,255,0.24)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(155,155,255,0.34)] active:translate-y-0"
              >
                <Plus size={15} strokeWidth={2.7} />
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
                    className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-[background-color,color,transform] duration-150 hover:-translate-y-px ${
                      selected
                        ? "bg-accent/20 text-text shadow-[inset_0_0_0_1px_rgba(155,155,255,0.16)]"
                        : "text-mute hover:bg-well hover:text-text"
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
      <div className="theme-inset flex min-w-0 max-w-[360px] items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            status === "error"
              ? "bg-rose"
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
        className="material-control flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-[12px] text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0"
      >
        <Unplug size={12} />
        Disconnect
      </button>
      <span
        className="hidden shrink-0 text-[11px] font-medium text-faint lg:inline"
        title={lastSavedAt ? new Date(lastSavedAt).toLocaleString() : undefined}
      >
        {autoSaveLabel}
      </span>
      <span className="flex-1" />
      <ThemeSwitcher />
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="material-control flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-line-strong text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <Undo2 size={13} />
      </button>
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Add step"
          aria-label="Add step"
          onClick={onAddStep}
          className="material-control flex h-8 w-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 md:w-auto md:px-3"
        >
          <Plus size={13} />
          <span className="hidden text-[12.5px] md:inline">Step</span>
        </button>
        <button
          type="button"
          title="Add group"
          aria-label="Add group"
          onClick={onAddGroup}
          className="material-control flex h-8 w-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 md:w-auto md:px-3"
        >
          <Plus size={13} />
          <span className="hidden text-[12.5px] md:inline">Group</span>
        </button>
      </div>
      <button
        type="button"
        title="Re-run the automatic layout"
        onClick={onTidy}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/70 bg-accent px-3 text-[12.5px] font-semibold text-on-accent shadow-[0_0_18px_rgba(155,155,255,0.24)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(155,155,255,0.34)] active:translate-y-0"
      >
        <Wand2 size={13} strokeWidth={2.7} />
        Tidy
      </button>
      <button
        type="button"
        title="Discard saved positions and reflow the active view"
        onClick={onResetLayout}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-amber/65 bg-amber/15 px-3 text-[12.5px] font-semibold text-amber shadow-[0_0_18px_rgba(238,194,122,0.12)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-amber/85 hover:bg-amber/20 hover:shadow-[0_0_22px_rgba(238,194,122,0.2)] active:translate-y-0"
      >
        <RotateCcw size={13} strokeWidth={2.4} />
        Reset
      </button>
      <button
        type="button"
        onClick={onAgentPrompt}
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/20 px-3 text-[12.5px] font-semibold text-accent shadow-[0_0_18px_rgba(155,155,255,0.12)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent/75 hover:bg-accent/30 hover:shadow-[0_0_22px_rgba(155,155,255,0.2)] active:translate-y-0"
      >
        <Bot size={13} />
        Agent Prompt
      </button>
    </header>
  );
}
