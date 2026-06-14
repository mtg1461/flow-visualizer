"use client";

import { useCallback, useRef, useState } from "react";

export const STORAGE_KEY = "flow-visualizer:data";

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

type StabilizeDoc<T> = (next: T, previous: T) => T;

interface Options<T> {
  initial: T;
  stabilize?: StabilizeDoc<T>;
  onRestore?: (doc: T) => void;
}

function persist<T>(doc: T | null) {
  try {
    if (doc) localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable; edits still live for this session.
  }
}

export function useEditorHistory<T>({
  initial,
  stabilize,
  onRestore,
}: Options<T>) {
  const [doc, setDocState] = useState<T>(() => initial);
  const [canUndo, setCanUndo] = useState(false);

  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastCommit = useRef({ key: "", at: 0 });

  const commit = useCallback(
    (next: T, coalesceKey?: string, shouldStabilize = true) => {
      if (shouldStabilize && stabilize)
        next = stabilize(next, docRef.current);
      const now = Date.now();
      const merge =
        !!coalesceKey &&
        coalesceKey === lastCommit.current.key &&
        now - lastCommit.current.at < COALESCE_MS;
      if (!merge) {
        past.current.push(docRef.current);
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }
      lastCommit.current = { key: coalesceKey ?? "", at: now };
      future.current = [];
      setCanUndo(true);
      setDocState(next);
      persist(next);
    },
    [stabilize]
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(past.current.length > 0);
    setDocState(prev);
    persist(prev);
    onRestore?.(prev);
  }, [onRestore]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(true);
    setDocState(next);
    persist(next);
    onRestore?.(next);
  }, [onRestore]);

  return { doc, docRef, commit, undo, redo, canUndo };
}
