"use client";

import { useEffect, useState } from "react";
import type { Explanation } from "@/lib/types";
import { SAMPLE } from "@/lib/sample";
import { parseExplanation } from "@/lib/parse";
import { Editor } from "@/components/Editor";
import { STORAGE_KEY } from "@/hooks/useEditorHistory";

export default function Home() {
  const [initial, setInitial] = useState<Explanation | null>(null);

  useEffect(() => {
    let doc = SAMPLE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const result = parseExplanation(stored);
        if (result.ok) doc = result.data;
      }
    } catch {
      // unreadable storage — fall back to the sample
    }
    setInitial(doc);
  }, []);

  if (!initial) return <div className="h-dvh bg-bg" />;
  return <Editor initial={initial} />;
}
