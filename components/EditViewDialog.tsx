"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

interface Props {
  open: boolean;
  viewTitle: string;
  viewSummary?: string;
  onCancel: () => void;
  onSave: (patch: { title: string; summary?: string }) => void;
}

export function EditViewDialog({
  open,
  viewTitle,
  viewSummary,
  onCancel,
  onSave,
}: Props) {
  const [title, setTitle] = useState(viewTitle);
  const [summary, setSummary] = useState(viewSummary ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(viewTitle);
    setSummary(viewSummary ?? "");
  }, [open, viewTitle, viewSummary]);

  if (!open) return null;

  const save = () => {
    onSave({
      title: title.trim() || "Untitled view",
      summary: summary.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel edit view"
        className="theme-overlay absolute inset-0 cursor-default backdrop-blur-sm"
        onClick={onCancel}
      />
      <form
        className="anim-pop material-panel relative w-full max-w-[460px] rounded-2xl border border-line-strong p-5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/16 text-accent">
            <Pencil size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-text">Edit view</h2>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">
              Update the view name and short description.
            </p>
          </div>
        </div>

        <label className="mt-5 block text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
          View name
        </label>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] font-medium text-text outline-none transition-colors placeholder:text-faint focus:border-accent/70"
          placeholder="Untitled view"
        />

        <label className="mt-4 block text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
          View description
        </label>
        <textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          className="mt-1.5 w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-text outline-none transition-colors placeholder:text-faint focus:border-accent/70"
          placeholder="Short description"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="material-control h-8 cursor-pointer rounded-lg border border-line-strong px-4 text-[12.5px] font-medium text-text/90 transition-[background-color,transform] duration-150 hover:-translate-y-px active:translate-y-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-8 cursor-pointer rounded-lg border border-accent/70 bg-accent px-4 text-[12.5px] font-semibold text-on-accent shadow-[0_0_18px_rgba(155,155,255,0.2)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-accent hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(155,155,255,0.3)] active:translate-y-0"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
