"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Copy, X } from "lucide-react";
import type { Explanation } from "@/lib/types";
import { parseExplanation } from "@/lib/parse";
import { SCHEMA_PROMPT } from "@/lib/prompt";
import { denormalize } from "@/lib/graph";

interface Props {
  open: boolean;
  doc: Explanation;
  onClose: () => void;
  onApply: (data: Explanation) => void;
}

export function JsonDialog({ open, doc, onClose, onApply }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"json" | "prompt" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setText(JSON.stringify(denormalize(doc), null, 2));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // refresh the textarea only when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async (what: "json" | "prompt") => {
    try {
      await navigator.clipboard.writeText(
        what === "json" ? text : SCHEMA_PROMPT
      );
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Couldn't reach the clipboard.");
    }
  };

  const apply = () => {
    const result = parseExplanation(text);
    if (result.ok) {
      setError(null);
      onApply(result.data);
    } else {
      setError(result.error);
    }
  };

  if (!open) return null;

  return (
    <div
      className="anim-appear fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ animationDuration: "0.18s" }}
      role="dialog"
      aria-modal="true"
      aria-label="Explanation JSON"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="anim-pop relative flex max-h-[85vh] w-full max-w-[680px] flex-col rounded-2xl border border-line-strong bg-raise p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-medium">Explanation JSON</h2>
            <p className="mt-0.5 text-[12px] text-mute">
              Edits on the canvas are already in here. Paste new JSON from your
              agent and apply to replace the flow.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="cursor-pointer rounded-full p-1.5 text-faint transition-colors hover:bg-line hover:text-text"
          >
            <X size={15} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          spellCheck={false}
          className="mt-4 min-h-[280px] w-full flex-1 resize-none rounded-xl border border-line bg-bg p-3.5 font-mono text-[12px] leading-relaxed text-text focus:border-accent/40 focus:outline-none"
        />

        {error && (
          <p className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-snug text-rose">
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => copy("prompt")}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-mute transition-colors hover:border-line-strong hover:text-text"
          >
            {copied === "prompt" ? (
              <Check size={12} className="text-teal" />
            ) : (
              <Copy size={12} />
            )}
            Schema prompt
          </button>
          <button
            type="button"
            onClick={() => copy("json")}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-mute transition-colors hover:border-line-strong hover:text-text"
          >
            {copied === "json" ? (
              <Check size={12} className="text-teal" />
            ) : (
              <Copy size={12} />
            )}
            Copy JSON
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12.5px] text-mute transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="h-8 cursor-pointer rounded-lg bg-accent px-4 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
