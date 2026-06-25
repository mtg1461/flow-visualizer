"use client";

import { useState, type DragEvent } from "react";
import {
  CircleAlert,
  Bot,
  FilePlus2,
  FolderOpen,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { FlowMark } from "./FlowMark";
import { SaveAccessScreen } from "./SaveAccessScreen";
import { ViewSelectionScreen } from "./ViewSelectionScreen";

export type FileSyncStatus =
  | "idle"
  | "loading"
  | "watching"
  | "saving"
  | "saved"
  | "external"
  | "conflict"
  | "error"
  | "example";

export interface ConnectionPreview {
  sourceName: string;
  canRequestWrite: boolean;
  views: {
    id: string;
    title: string;
    summary?: string;
    stepCount: number;
  }[];
}

interface Props {
  status: FileSyncStatus;
  error: string | null;
  preview: ConnectionPreview | null;
  /** Whether disk paths apply (off on a hosted build) — tunes the drop copy. */
  allowLocalPath: boolean;
  onConnectPreview: (viewId: string) => void;
  onRequestSaveAccess: () => void;
  onClearPreview: () => void;
  onBrowse: () => void;
  onCreateEmpty: () => void;
  onDropConnection: (dataTransfer: DataTransfer) => void;
  onSeeExample: () => void;
  onHowItWorks: () => void;
  onAgentPrompt: () => void;
}

export function ConnectionScreen({
  status,
  error,
  preview,
  allowLocalPath,
  onConnectPreview,
  onRequestSaveAccess,
  onClearPreview,
  onBrowse,
  onCreateEmpty,
  onDropConnection,
  onSeeExample,
  onHowItWorks,
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
    if (preview.canRequestWrite) {
      return (
        <SaveAccessScreen
          status={status}
          error={error}
          preview={preview}
          onAllowSave={onRequestSaveAccess}
          onClear={onClearPreview}
          onAgentPrompt={onAgentPrompt}
        />
      );
    }

    return (
      <ViewSelectionScreen
        status={status}
        error={error}
        preview={preview}
        onSelect={onConnectPreview}
        onClear={onClearPreview}
        onAgentPrompt={onAgentPrompt}
      />
    );
  }

  return (
    <main className="app-shell flex h-dvh items-center justify-center p-5">
      <section className="anim-pop material-panel w-full max-w-[720px] rounded-2xl border border-line-strong p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <FlowMark size={52} className="shrink-0" />
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
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/20 px-3 text-[12.5px] font-semibold text-accent shadow-[0_0_18px_rgba(155,155,255,0.12)] transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-accent/75 hover:bg-accent/30 active:translate-y-0"
          >
            <Bot size={13} />
            Agent Prompt
          </button>
        </div>

        <div className="mt-6">
          <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
            Open a file
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onBrowse}
              disabled={busy}
              className="material-control flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[12.5px] text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderOpen size={13} />
              Browse
            </button>
            <button
              type="button"
              onClick={onHowItWorks}
              className="material-control flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[12.5px] text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0"
            >
              <Workflow size={13} />
              How it works
            </button>
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
              : "border-line-strong bg-well"
          }`}
        >
          <Upload size={20} className="text-accent" />
          <p className="mt-3 text-[13px] font-medium text-text">
            {allowLocalPath ? "Drop a JSON file or path" : "Drop a JSON file"}
          </p>
          <p className="mt-1 max-w-[420px] text-[12px] leading-relaxed text-mute">
            Edits save straight back to the file you open.
          </p>
        </div>

        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-faint">
            or
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={onCreateEmpty}
          disabled={busy}
          className="material-control flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong px-4 py-3 text-[13px] font-semibold text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FilePlus2 size={15} />
          Create empty flow
        </button>
        <p className="mt-2 text-center text-[11.5px] text-faint">
          Pick a location to save a new flow file, then start building.
        </p>

        <button
          type="button"
          onClick={onSeeExample}
          disabled={busy}
          className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-4 py-3 text-[13px] font-medium text-accent transition-[background-color,transform] duration-150 hover:-translate-y-px hover:bg-accent/25 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={15} />
          See an example flow
        </button>
        <p className="mt-2 text-center text-[11.5px] text-faint">
          Opens a sample you can pan, zoom, and edit — nothing saves to a file.
        </p>

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
