"use client";

import { useCallback, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import type { Explanation } from "@/lib/types";
import { SAMPLE } from "@/lib/sample";
import { parseExplanation } from "@/lib/parse";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { PartsStrip } from "@/components/PartsStrip";
import { Flow } from "@/components/Flow";
import { ImportDialog } from "@/components/ImportDialog";

const STORAGE_KEY = "unfold:data";

export default function Home() {
  const [data, setData] = useState<Explanation>(SAMPLE);
  const [isCustom, setIsCustom] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const result = parseExplanation(stored);
      if (result.ok) {
        setData(result.data);
        setIsCustom(true);
      }
    } catch {
      // ignore unreadable storage
    }
  }, []);

  const handleImport = useCallback((next: Explanation) => {
    setData(next);
    setIsCustom(true);
    setDialogOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full or unavailable — the view still works for this session
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleReset = useCallback(() => {
    setData(SAMPLE);
    setIsCustom(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <Header
        isCustom={isCustom}
        onOpen={() => setDialogOpen(true)}
        onReset={handleReset}
      />
      <main className="relative overflow-x-clip pb-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden"
        >
          <div className="absolute left-1/2 top-[-240px] h-[540px] w-[840px] -translate-x-1/2 rounded-full bg-accent/[0.07] blur-[120px]" />
        </div>

        <Hero data={data} isCustom={isCustom} onOpen={() => setDialogOpen(true)} />
        <PartsStrip key={`parts-${data.title}`} data={data} />
        <Flow key={`flow-${data.title}`} data={data} />

        <footer className="mt-28 border-t border-line py-9 text-center text-[12px] text-faint">
          Unfold · one elegant flow from any agent&apos;s explanation · stays in
          your browser
        </footer>
      </main>
      <ImportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onImport={handleImport}
      />
    </MotionConfig>
  );
}
