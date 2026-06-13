"use client";

import {
  Bot,
  ClipboardCopy,
  FileJson,
  Plug,
  SquarePen,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Jump straight to the copyable agent prompt. */
  onOpenAgentPrompt: () => void;
}

type Tone = "accent" | "teal" | "amber" | "rose";

const TONE: Record<Tone, string> = {
  accent: "border-accent/30 bg-accent/15 text-accent",
  teal: "border-teal/30 bg-teal/15 text-teal",
  amber: "border-amber/30 bg-amber/15 text-amber",
  rose: "border-rose/30 bg-rose/15 text-rose",
};

const STEPS: { icon: LucideIcon; tone: Tone; title: string; body: string }[] = [
  {
    icon: ClipboardCopy,
    tone: "accent",
    title: "Copy the agent prompt",
    body: "A short JSON contract that tells an agent exactly what to produce.",
  },
  {
    icon: Bot,
    tone: "teal",
    title: "Hand it to your coding agent",
    body: "Paste it into an agent working in your repo so it has the project's full context.",
  },
  {
    icon: FileJson,
    tone: "amber",
    title: "It writes a flow file",
    body: "The agent saves a small JSON file — like docs/payments-flow.json — describing how the system works.",
  },
  {
    icon: Plug,
    tone: "rose",
    title: "Connect the file here",
    body: "Browse to it or drag it onto this screen to open it on the canvas.",
  },
  {
    icon: SquarePen,
    tone: "accent",
    title: "Edit visually — it saves back",
    body: "Drag tiles, edit steps, and restyle edges. Changes write straight back to your file.",
  },
];

export function HowItWorksDialog({ open, onClose, onOpenAgentPrompt }: Props) {
  if (!open) return null;

  return (
    <div
      className="anim-appear fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ animationDuration: "0.18s" }}
      role="dialog"
      aria-modal="true"
      aria-label="How it works"
    >
      <button
        type="button"
        aria-label="Close how it works"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div className="anim-pop relative flex max-h-[85dvh] w-full max-w-[560px] flex-col rounded-2xl border border-line-strong bg-raise p-5 shadow-2xl shadow-black/40">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent">
              <Workflow size={16} />
            </div>
            <div>
              <h2 className="text-[15px] font-medium">How it works</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                From a plain-language ask to an editable diagram, in five steps.
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

        <ol className="mt-5 overflow-y-auto pr-1">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isLast = i === STEPS.length - 1;
            return (
              <li key={step.title} className="relative flex gap-3.5 pb-5 last:pb-0">
                {!isLast && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 left-4 top-9 w-px -translate-x-1/2 bg-line-strong"
                  />
                )}
                <span
                  className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${TONE[step.tone]}`}
                >
                  <Icon size={15} strokeWidth={2} />
                </span>
                <div className="pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-medium tabular-nums text-faint">
                      {i + 1}
                    </span>
                    <h3 className="text-[13.5px] font-medium text-text">
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex shrink-0 items-center justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-8 cursor-pointer rounded-lg px-3 text-[12.5px] text-mute transition-colors hover:text-text"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={onOpenAgentPrompt}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-4 text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            <ClipboardCopy size={13} />
            Open Agent Prompt
          </button>
        </div>
      </div>
    </div>
  );
}
