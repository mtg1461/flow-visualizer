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
    body: "The JSON contract for your agent.",
  },
  {
    icon: Bot,
    tone: "teal",
    title: "Hand it to your agent",
    body: "Paste it into a coding agent in your repo.",
  },
  {
    icon: FileJson,
    tone: "amber",
    title: "It writes a flow file",
    body: "A small JSON describing the system.",
  },
  {
    icon: Plug,
    tone: "rose",
    title: "Connect it here",
    body: "Browse or drag the file in.",
  },
  {
    icon: SquarePen,
    tone: "accent",
    title: "Edit visually",
    body: "Changes save back to the file.",
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
      <div className="anim-pop material-panel relative flex max-h-[85dvh] w-full max-w-[560px] flex-col rounded-2xl border border-white/20 p-5 shadow-2xl shadow-black/55">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
              <Workflow size={20} />
            </div>
            <h2 className="text-[22px] font-medium tracking-tight">How it works</h2>
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
