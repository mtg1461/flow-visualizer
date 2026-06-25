"use client";

import { ArrowLeft, Bot, CircleAlert, FileJson, Save } from "lucide-react";
import type { ConnectionPreview, FileSyncStatus } from "./ConnectionScreen";

interface Props {
  status: FileSyncStatus;
  error: string | null;
  preview: ConnectionPreview;
  onAllowSave: () => void;
  onClear: () => void;
  onAgentPrompt: () => void;
}

export function SaveAccessScreen({
  status,
  error,
  preview,
  onAllowSave,
  onClear,
  onAgentPrompt,
}: Props) {
  const busy = status === "loading";

  return (
    <main className="app-shell flex h-dvh items-center justify-center p-5">
      <section className="anim-pop material-panel w-full max-w-[620px] rounded-2xl border border-line-strong p-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClear}
            className="material-control flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[12px] text-mute transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:text-text active:translate-y-0"
          >
            <ArrowLeft size={13} />
            Choose another
          </button>
          <button
            type="button"
            onClick={onAgentPrompt}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/20 px-3 text-[12.5px] font-semibold text-accent shadow-[0_0_18px_rgba(155,155,255,0.12)] transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-accent/75 hover:bg-accent/30 active:translate-y-0"
          >
            <Bot size={13} />
            Agent Prompt
          </button>
        </div>

        <div className="mt-6 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
            <FileJson size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-semibold">Allow saving changes?</h1>
            <p className="mt-1 truncate font-mono text-[11.5px] text-faint">
              {preview.sourceName}
            </p>
            <p className="mt-4 text-[12.5px] leading-relaxed text-mute">
              Flow Visualizer needs write permission before you choose a view,
              so edits can save back to this file while you work.
            </p>
          </div>
        </div>

        <div className="theme-inset mt-6 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-mute">
              {preview.views.length} view{preview.views.length === 1 ? "" : "s"} found
            </span>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">
              Save access first
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-snug text-rose">
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onAllowSave}
          disabled={busy}
          className="mt-5 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/70 bg-accent px-4 text-[13px] font-semibold text-on-accent shadow-[0_0_18px_rgba(155,155,255,0.24)] transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(155,155,255,0.34)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={15} strokeWidth={2.6} />
          Allow saving changes
        </button>
      </section>
    </main>
  );
}
