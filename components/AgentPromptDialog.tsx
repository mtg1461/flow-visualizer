"use client";

import { useState } from "react";
import { Bot, Check, ClipboardCopy, X } from "lucide-react";
import {
  RECEIVE_RESPONSE_PROMPT,
  WRITE_PROJECT_PROMPT,
} from "@/lib/prompt";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AgentPromptDialog({ open, onClose }: Props) {
  const [mode, setMode] = useState<"write" | "receive">("write");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const prompt =
    mode === "write" ? WRITE_PROJECT_PROMPT : RECEIVE_RESPONSE_PROMPT;

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="anim-appear fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ animationDuration: "0.18s" }}
      role="dialog"
      aria-modal="true"
      aria-label="Agent prompt"
    >
      <button
        type="button"
        aria-label="Close agent prompt"
        onClick={onClose}
        className="theme-overlay absolute inset-0 cursor-default backdrop-blur-sm"
      />
      <div className="anim-pop material-panel relative flex max-h-[82dvh] w-full max-w-[760px] flex-col rounded-2xl border border-line-strong p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent">
              <Bot size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-medium">Agent Prompt</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                Give this to an agent when you want it to create a flow file.
              </p>
            </div>
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

        <div className="theme-inset mt-4 grid rounded-xl border border-line p-1 text-[12.5px] font-medium sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setMode("write");
              setCopied(false);
            }}
            className={`h-9 cursor-pointer rounded-lg px-3 transition-colors ${
              mode === "write"
                ? "bg-accent text-on-accent"
                : "text-mute hover:bg-white/10 hover:text-text"
            }`}
          >
            Write into project
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("receive");
              setCopied(false);
            }}
            className={`h-9 cursor-pointer rounded-lg px-3 transition-colors ${
              mode === "receive"
                ? "bg-accent text-on-accent"
                : "text-mute hover:bg-white/10 hover:text-text"
            }`}
          >
            Receive response
          </button>
        </div>

        <textarea
          readOnly
          spellCheck={false}
          value={prompt}
          className="mt-4 min-h-[320px] flex-1 resize-none rounded-xl border border-line bg-well p-3 font-mono text-[12px] leading-relaxed text-text shadow-inner focus:outline-none"
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12.5px] text-mute transition-colors hover:text-text"
          >
            Close
          </button>
          <button
            type="button"
            onClick={copyPrompt}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-4 text-[12.5px] font-medium text-on-accent transition-opacity hover:opacity-90"
          >
            {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
            {copied ? "Copied" : "Copy Prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}
