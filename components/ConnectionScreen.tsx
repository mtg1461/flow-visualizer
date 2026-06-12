"use client";

import { useState, type DragEvent } from "react";
import {
  CircleAlert,
  ArrowLeft,
  Bot,
  FileJson,
  FolderOpen,
  Link2,
  Upload,
} from "lucide-react";

export type FileSyncStatus =
  | "idle"
  | "loading"
  | "watching"
  | "saving"
  | "saved"
  | "external"
  | "error";

export interface ConnectionPreview {
  sourceName: string;
  canRequestWrite: boolean;
}

interface Props {
  path: string;
  status: FileSyncStatus;
  error: string | null;
  preview: ConnectionPreview | null;
  onPathChange: (path: string) => void;
  onConnectPreview: () => void;
  onClearPreview: () => void;
  onBrowse: () => void;
  onDropConnection: (dataTransfer: DataTransfer) => void;
  onAgentPrompt: () => void;
}

const EXAMPLE_PATH = "examples\\live-flow.json";

export function ConnectionScreen({
  path,
  status,
  error,
  preview,
  onPathChange,
  onConnectPreview,
  onClearPreview,
  onBrowse,
  onDropConnection,
  onAgentPrompt,
}: Props) {
  const [over, setOver] = useState(false);
  const busy = status === "loading";

  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    onDropConnection(e.dataTransfer);
  };

  if (preview) {
    return (
      <main className="flex h-dvh items-center justify-center bg-bg p-5">
        <section className="anim-pop w-full max-w-[720px] rounded-2xl border border-line-strong bg-raise p-6 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClearPreview}
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
              <h1 className="text-[18px] font-semibold">Ready to connect</h1>
              <p className="truncate font-mono text-[11.5px] text-faint">
                {preview.sourceName}
              </p>
            </div>
          </div>

          {preview.canRequestWrite && (
            <p className="mt-4 text-[12.5px] leading-relaxed text-mute">
              Your browser will ask for permission to save changes to this file
              when you connect.
            </p>
          )}

          {error && (
            <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-snug text-rose">
              <CircleAlert size={13} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onConnectPreview}
              disabled={busy}
              className="h-9 cursor-pointer rounded-lg bg-accent px-5 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-dvh items-center justify-center bg-bg p-5">
      <section className="anim-pop w-full max-w-[720px] rounded-2xl border border-line-strong bg-raise p-6 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
              <Link2 size={18} />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold">Connect Flow File</h1>
              <p className="mt-0.5 text-[12.5px] text-mute">
                Open a JSON source before entering the canvas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAgentPrompt}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/25"
          >
            <Bot size={13} />
            Agent Prompt
          </button>
        </div>

        <div className="mt-6">
          <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Local path
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-well px-3 py-2 focus-within:border-accent/60">
              <FileJson size={14} className="shrink-0 text-accent" />
              <input
                aria-label="Local path"
                value={path}
                onChange={(e) => onPathChange(e.target.value)}
                spellCheck={false}
                placeholder={EXAMPLE_PATH}
                className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-text placeholder:text-faint focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onBrowse}
                disabled={busy}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[12.5px] text-text/90 transition-colors hover:bg-tile disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={`mt-5 flex min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center transition-colors ${
            over
              ? "border-accent bg-accent/10"
              : "border-line-strong bg-surface"
          }`}
        >
          <Upload size={20} className="text-accent" />
          <p className="mt-3 text-[13px] font-medium text-text">
            Drop a JSON file or path
          </p>
          <p className="mt-1 max-w-[420px] text-[12px] leading-relaxed text-mute">
            Browser file access writes through when available; pasted paths use
            the local app API.
          </p>
        </div>

        {error && (
          <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-snug text-rose">
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
