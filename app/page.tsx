"use client";

import { useEffect, useState } from "react";
import type { Explanation } from "@/lib/types";
import { SAMPLE } from "@/lib/sample";
import { parseExplanation } from "@/lib/parse";
import { Editor, STORAGE_KEY } from "@/components/Editor";

export default function Home() {
  const [initial, setInitial] = useState<{
    doc: Explanation;
    custom: boolean;
  } | null>(null);

  useEffect(() => {
    let doc = SAMPLE;
    let custom = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const result = parseExplanation(stored);
        if (result.ok) {
          doc = result.data;
          custom = true;
        }
      }
    } catch {
      // unreadable storage — fall back to the sample
    }
    setInitial({ doc, custom });
  }, []);

  if (!initial) return <div className="h-dvh bg-bg" />;
  return <Editor initial={initial.doc} initialCustom={initial.custom} />;
}
