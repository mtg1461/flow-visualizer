"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, CircleAlert, Copy, X } from "lucide-react";
import type { Explanation } from "@/lib/types";
import { parseExplanation } from "@/lib/parse";
import { SCHEMA_PROMPT } from "@/lib/prompt";

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (data: Explanation) => void;
}

export function ImportDialog({ open, onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(SCHEMA_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't reach the clipboard — copy from lib/prompt.ts instead.");
    }
  };

  const visualize = () => {
    const result = parseExplanation(text);
    if (result.ok) {
      setError(null);
      setText("");
      onImport(result.data);
    } else {
      setError(result.error);
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Paste an explanation"
    >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="relative w-full max-w-[620px] rounded-2xl border border-line-strong bg-raise p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-serif text-[22px] italic">
                  Paste an explanation
                </h2>
                <p className="mt-1 max-w-[44ch] text-[13px] leading-relaxed text-mute">
                  Ask your agent how something works, copy the JSON it returns,
                  and drop it here.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="cursor-pointer rounded-full p-1.5 text-faint transition-colors hover:bg-line hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={copyPrompt}
              className="mt-4 flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] text-mute transition-colors hover:border-line-strong hover:text-text"
            >
              {copied ? (
                <Check size={13} className="text-teal" />
              ) : (
                <Copy size={13} />
              )}
              {copied ? "Copied — give it to your agent" : "Copy the schema prompt"}
            </button>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              spellCheck={false}
              placeholder='{ "title": "How … works", "steps": [ … ] }'
              className="mt-4 h-52 w-full resize-none rounded-xl border border-line bg-bg p-4 font-mono text-[12.5px] leading-relaxed text-text placeholder:text-faint focus:border-accent/40 focus:outline-none"
            />

            {error && (
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-rose">
                <CircleAlert size={14} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="h-9 cursor-pointer rounded-full px-4 text-[13px] text-mute transition-colors hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={visualize}
                disabled={text.trim() === ""}
                className="h-9 cursor-pointer rounded-full bg-accent px-5 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Visualize
              </button>
            </div>
          </motion.div>
    </motion.div>
  );
}
