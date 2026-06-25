"use client";

import { AlertTriangle, Download, Upload } from "lucide-react";

interface Props {
  open: boolean;
  sourceName: string;
  detectedAt: number;
  externalUpdatedAt: number;
  busy: boolean;
  onKeepLocal: () => void;
  onReloadExternal: () => void;
}

export function FileConflictDialog({
  open,
  sourceName,
  detectedAt,
  externalUpdatedAt,
  busy,
  onKeepLocal,
  onReloadExternal,
}: Props) {
  if (!open) return null;

  const detected = new Date(detectedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const external = new Date(externalUpdatedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="anim-appear fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ animationDuration: "0.18s" }}
      role="dialog"
      aria-modal="true"
      aria-label="File sync conflict"
    >
      <div className="theme-overlay absolute inset-0 backdrop-blur-sm" />
      <div className="anim-pop material-panel relative w-full max-w-[500px] rounded-2xl border border-line-strong p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber/35 bg-amber/10 text-amber">
            <AlertTriangle size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium">
              File changed outside the app
            </h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
              Autosave is paused because{" "}
              <span className="break-all text-text">{sourceName}</span> changed
              while this canvas also has local edits.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
              External change: {external}. Conflict detected: {detected}.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={onReloadExternal}
            className="material-control flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong px-4 py-2.5 text-[12.5px] font-medium text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} />
            Reload file
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onKeepLocal}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/70 bg-accent px-4 py-2.5 text-[12.5px] font-semibold text-on-accent shadow-[0_0_18px_rgba(155,155,255,0.2)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(155,155,255,0.3)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={14} />
            Keep app changes
          </button>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
          Reloading replaces the canvas with the file copy. Keeping app changes
          overwrites the file with the current canvas.
        </p>
      </div>
    </div>
  );
}
