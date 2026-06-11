"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Explanation } from "@/lib/types";
import { flowStats } from "@/lib/meta";

interface Props {
  data: Explanation;
  isCustom: boolean;
  onOpen: () => void;
}

export function Hero({ data, isCustom, onOpen }: Props) {
  const stats = flowStats(data);
  const chips: [number, string][] = [
    [stats.parts, stats.parts === 1 ? "moving part" : "moving parts"],
    [stats.steps, stats.steps === 1 ? "step" : "steps"],
    [stats.decisions, stats.decisions === 1 ? "decision" : "decisions"],
    [stats.feedback, stats.feedback === 1 ? "feedback loop" : "feedback loops"],
  ];

  return (
    <section className="relative mx-auto max-w-[840px] px-5 pb-2 pt-32 text-center md:pt-40">
      {!isCustom && (
        <button
          type="button"
          onClick={onOpen}
          className="mx-auto mb-7 flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] text-faint transition-colors hover:border-line-strong hover:text-mute"
        >
          <Sparkles size={11} />
          sample — paste your own
        </button>
      )}
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="font-serif text-[38px] italic leading-[1.08] tracking-[-0.01em] text-text md:text-[54px]"
      >
        {data.title}
      </motion.h1>
      {data.summary && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: "easeOut" }}
          className="mx-auto mt-5 max-w-[58ch] text-[14.5px] leading-relaxed text-mute md:text-[15.5px]"
        >
          {data.summary}
        </motion.p>
      )}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="mt-9 flex flex-wrap justify-center gap-2"
      >
        {chips
          .filter(([n]) => n > 0)
          .map(([n, label]) => (
            <span
              key={label}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] text-mute"
            >
              <span className="mr-1.5 font-serif text-[15px] italic text-text">
                {n}
              </span>
              {label}
            </span>
          ))}
      </motion.div>
    </section>
  );
}
