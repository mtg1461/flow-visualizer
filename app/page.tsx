"use client";

import { useEffect, useState } from "react";
import type { FlowFile } from "@/lib/types";
import { SAMPLE } from "@/lib/sample";
import { parseFlowFile } from "@/lib/parse";
import { Editor } from "@/components/Editor";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { STORAGE_KEY } from "@/hooks/useEditorHistory";

export default function Home() {
  const [initial, setInitial] = useState<FlowFile | null>(null);

  useEffect(() => {
    let doc = SAMPLE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const result = parseFlowFile(stored);
        if (result.ok) doc = result.data;
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // unreadable storage — fall back to the sample
    }
    setInitial(doc);
  }, []);

  if (!initial) {
    return (
      <main className="app-shell flex h-dvh items-center justify-center p-5">
        <div className="material-panel rounded-xl border border-line-strong px-4 py-3 text-[12.5px] text-mute">
          Loading Flow Visualizer...
        </div>
      </main>
    );
  }

  return (
    <AppErrorBoundary>
      <Editor initial={initial} />
    </AppErrorBoundary>
  );
}
