"use client";

import { useEffect, useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  Bot,
  CircleAlert,
  FileJson,
  GitBranch,
} from "lucide-react";
import type { ConnectionPreview, FileSyncStatus } from "./ConnectionScreen";

interface Props {
  status: FileSyncStatus;
  error: string | null;
  preview: ConnectionPreview;
  onSelect: (viewId: string) => void;
  onClear: () => void;
  onAgentPrompt: () => void;
}

interface LaunchState {
  id: string;
  rect: DOMRect;
  active: boolean;
}

export function ViewSelectionScreen({
  status,
  error,
  preview,
  onSelect,
  onClear,
  onAgentPrompt,
}: Props) {
  const [launch, setLaunch] = useState<LaunchState | null>(null);
  const busy = status === "loading" || !!launch;
  const selected = launch
    ? preview.views.find((view) => view.id === launch.id)
    : null;

  useEffect(() => {
    if (status === "error" || error) setLaunch(null);
  }, [error, status]);

  const choose =
    (viewId: string) => (event: MouseEvent<HTMLButtonElement>) => {
      if (busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setLaunch({ id: viewId, rect, active: false });
      window.requestAnimationFrame(() => {
        setLaunch((current) =>
          current?.id === viewId ? { ...current, active: true } : current
        );
      });
      window.setTimeout(() => onSelect(viewId), 340);
    };

  return (
    <main className="flex h-dvh items-center justify-center bg-bg p-5">
      <section className="anim-pop w-full max-w-[760px] rounded-2xl border border-line-strong bg-raise p-6 shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-mute transition-colors hover:border-line-strong hover:text-text"
          >
            <ArrowLeft size={13} />
            Choose another
          </button>
          <button
            type="button"
            onClick={onAgentPrompt}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/25"
          >
            <Bot size={13} />
            Agent Prompt
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
            <FileJson size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold">Choose a flow view</h1>
            <p className="truncate font-mono text-[11.5px] text-faint">
              {preview.sourceName}
            </p>
          </div>
        </div>

        {preview.canRequestWrite && (
          <p className="mt-4 text-[12.5px] leading-relaxed text-mute">
            Your browser will ask for permission to save changes to this file
            when you open a view.
          </p>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {preview.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={choose(view.id)}
              disabled={busy}
              className={`group min-h-[94px] cursor-pointer rounded-xl border border-line-strong bg-surface p-3 text-left transition-[border-color,background-color,opacity,transform] duration-150 hover:-translate-y-px hover:border-accent/50 hover:bg-tile disabled:cursor-not-allowed ${
                launch?.id === view.id ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent">
                  <GitBranch size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text">
                    {view.title}
                  </span>
                  {view.summary && (
                    <span className="mt-1 line-clamp-2 block text-[11.5px] leading-relaxed text-mute">
                      {view.summary}
                    </span>
                  )}
                  <span className="mt-2 block text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">
                    {view.stepCount} steps
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-snug text-rose">
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {launch && selected && (
        <div
          aria-hidden
          className="fixed z-[60] rounded-xl border border-accent/50 bg-raise px-3 py-2 text-left shadow-2xl shadow-black/40"
          style={{
            left: launch.active ? 14 : launch.rect.left,
            top: launch.active ? 8 : launch.rect.top,
            width: launch.active ? 300 : launch.rect.width,
            height: launch.active ? 34 : launch.rect.height,
            opacity: launch.active ? 0.92 : 1,
            transition:
              "left 320ms cubic-bezier(0.22,1,0.36,1), top 320ms cubic-bezier(0.22,1,0.36,1), width 320ms cubic-bezier(0.22,1,0.36,1), height 320ms cubic-bezier(0.22,1,0.36,1), opacity 220ms ease",
          }}
        >
          <div className="truncate text-[13px] font-medium text-text">
            {selected.title}
          </div>
        </div>
      )}
    </main>
  );
}
