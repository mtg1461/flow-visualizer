"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionPreview, FileSyncStatus } from "@/components/ConnectionScreen";
import type { Explanation } from "@/lib/types";
import { parseExplanation } from "@/lib/parse";
import {
  denormalize,
  normalize,
  resolveGroupConflicts,
} from "@/lib/graph";

interface LocalFileRead {
  path: string;
  contents: string;
  mtimeMs: number;
  size: number;
}

interface LocalFileStat {
  path: string;
  mtimeMs: number;
  size: number;
}

interface BrowserWritable {
  write: (contents: string) => Promise<void>;
  close: () => Promise<void>;
}

interface BrowserFileHandle {
  kind?: string;
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  createWritable?: () => Promise<BrowserWritable>;
}

interface BrowserFileConnection {
  name: string;
  lastModified: number;
  size: number;
  handle: BrowserFileHandle;
}

type PendingConnection =
  | (LocalFileRead & {
      kind: "path";
      preview: Explanation;
      normalized: Explanation;
      sourceName: string;
    })
  | {
      kind: "browser";
      preview: Explanation;
      normalized: Explanation;
      sourceName: string;
      lastModified: number;
      size: number;
      handle: BrowserFileHandle;
    };

declare global {
  interface Window {
    showOpenFilePicker?: (options?: unknown) => Promise<BrowserFileHandle[]>;
  }

  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<BrowserFileHandle | { kind?: string }>;
  }
}

interface Options {
  doc: Explanation;
  commit: (next: Explanation, coalesceKey?: string, stabilize?: boolean) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

function singleDroppedPath(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1)
    throw new Error("Connect one JSON file at a time.");
  return lines[0] ?? "";
}

function serializeDoc(doc: Explanation) {
  return JSON.stringify(denormalize(doc), null, 2);
}

async function postFileApi<T>(
  endpoint: "read" | "stat" | "write",
  body: { path: string; contents?: string }
): Promise<T> {
  const response = await fetch(`/api/file/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string" ? data.error : "File operation failed."
    );
  return data as T;
}

function isBrowserFileHandle(handle: unknown): handle is BrowserFileHandle {
  return (
    typeof handle === "object" &&
    handle !== null &&
    typeof (handle as BrowserFileHandle).name === "string" &&
    typeof (handle as BrowserFileHandle).getFile === "function"
  );
}

function toConnectionPreview(
  sourceName: string,
  doc: Explanation,
  canRequestWrite: boolean
): ConnectionPreview {
  return {
    sourceName,
    title: doc.title,
    summary: doc.summary,
    stepCount: doc.steps.length,
    actorCount: doc.actors?.length ?? 0,
    groupCount: doc.groups?.length ?? 0,
    canRequestWrite,
  };
}

export function useFileConnection({
  doc,
  commit,
  onConnected,
  onDisconnected,
}: Options) {
  const [path, setPathState] = useState("");
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);
  const [boundFile, setBoundFile] = useState<LocalFileStat | null>(null);
  const [browserFile, setBrowserFile] =
    useState<BrowserFileConnection | null>(null);
  const [status, setStatus] = useState<FileSyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const lastFileJson = useRef(serializeDoc(doc));
  const saveTimer = useRef<number | null>(null);
  const readingFile = useRef(false);

  const connected = !!boundFile || !!browserFile;
  const connectionName = boundFile?.path ?? browserFile?.name ?? "";
  const preview = useMemo(
    () =>
      pendingConnection
        ? toConnectionPreview(
            pendingConnection.sourceName,
            pendingConnection.preview,
            pendingConnection.kind === "browser" &&
              !!pendingConnection.handle.requestPermission
          )
        : null,
    [pendingConnection]
  );

  const settleStatus = useCallback((nextStatus: FileSyncStatus) => {
    setStatus(nextStatus);
    if (nextStatus === "saved" || nextStatus === "external") {
      window.setTimeout(() => {
        setStatus((current) =>
          current === nextStatus ? "watching" : current
        );
      }, 1300);
    }
  }, []);

  const previewPath = useCallback(async (nextPath: string) => {
    const wanted = nextPath.trim();
    if (!wanted) {
      setPendingConnection(null);
      setError(null);
      setStatus("idle");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const data = await postFileApi<LocalFileRead>("read", { path: wanted });
      const result = parseExplanation(data.contents);
      if (!result.ok) throw new Error(result.error);
      const normalized = resolveGroupConflicts(normalize(result.data));
      setPendingConnection({
        ...data,
        kind: "path",
        preview: result.data,
        normalized,
        sourceName: data.path,
      });
      setStatus("watching");
    } catch (previewError) {
      setPendingConnection(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Could not preview file."
      );
      setStatus("error");
    }
  }, []);

  const previewBrowserHandle = useCallback(async (handle: BrowserFileHandle) => {
    if (handle.kind && handle.kind !== "file") {
      setPendingConnection(null);
      setError("Drop or browse to a JSON file.");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const file = await handle.getFile();
      const result = parseExplanation(await file.text());
      if (!result.ok) throw new Error(result.error);
      const normalized = resolveGroupConflicts(normalize(result.data));
      setPendingConnection({
        kind: "browser",
        preview: result.data,
        normalized,
        sourceName: handle.name || file.name || "flow.json",
        lastModified: file.lastModified,
        size: file.size,
        handle,
      });
      setStatus("watching");
    } catch (previewError) {
      setPendingConnection(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Could not preview file."
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (connected) return;
    const wanted = path.trim();
    if (!wanted) {
      setPendingConnection((current) =>
        current?.kind === "path" ? null : current
      );
      setError(null);
      setStatus("idle");
      return;
    }
    const id = window.setTimeout(() => previewPath(wanted), 450);
    return () => window.clearTimeout(id);
  }, [connected, path, previewPath]);

  const loadPath = useCallback(
    async (nextPath = path, source: "manual" | "watch" = "manual") => {
      const wanted = nextPath.trim();
      if (!wanted) {
        setError("Enter a local JSON file path.");
        setStatus("error");
        return;
      }
      readingFile.current = true;
      setError(null);
      setStatus(source === "watch" ? "external" : "loading");
      try {
        const data = await postFileApi<LocalFileRead>("read", { path: wanted });
        const result = parseExplanation(data.contents);
        if (!result.ok) throw new Error(result.error);
        const next = resolveGroupConflicts(normalize(result.data));
        lastFileJson.current = serializeDoc(next);
        setPathState(data.path);
        setBoundFile({
          path: data.path,
          mtimeMs: data.mtimeMs,
          size: data.size,
        });
        setBrowserFile(null);
        commit(next, undefined, false);
        onConnected();
        settleStatus(source === "watch" ? "external" : "watching");
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Could not open file."
        );
        setStatus("error");
      } finally {
        window.setTimeout(() => {
          readingFile.current = false;
        }, 0);
      }
    },
    [commit, onConnected, path, settleStatus]
  );

  const connectBrowserHandle = useCallback(
    async (
      handle: BrowserFileHandle,
      source: "manual" | "watch" = "manual"
    ) => {
      if (handle.kind && handle.kind !== "file") {
        setError("Drop or browse to a JSON file.");
        setStatus("error");
        return;
      }
      readingFile.current = true;
      setError(null);
      setStatus(source === "watch" ? "external" : "loading");
      try {
        const file = await handle.getFile();
        const result = parseExplanation(await file.text());
        if (!result.ok) throw new Error(result.error);
        const next = resolveGroupConflicts(normalize(result.data));
        lastFileJson.current = serializeDoc(next);
        setBoundFile(null);
        setBrowserFile({
          name: handle.name || file.name || "flow.json",
          lastModified: file.lastModified,
          size: file.size,
          handle,
        });
        commit(next, undefined, false);
        onConnected();
        settleStatus(source === "watch" ? "external" : "watching");
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Could not open file."
        );
        setStatus("error");
      } finally {
        window.setTimeout(() => {
          readingFile.current = false;
        }, 0);
      }
    },
    [commit, onConnected, settleStatus]
  );

  const browseFile = useCallback(async () => {
    if (!window.showOpenFilePicker) {
      setError("Browse needs browser file access. Paste a local path instead.");
      setStatus("error");
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "JSON files",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      if (handles.length !== 1)
        throw new Error("Connect one JSON file at a time.");
      const [handle] = handles;
      if (handle) {
        setPathState("");
        await previewBrowserHandle(handle);
      }
    } catch (browseError) {
      const name = browseError instanceof Error ? browseError.name : "";
      if (name !== "AbortError") {
        setError(
          browseError instanceof Error
            ? browseError.message
            : "Could not browse file."
        );
        setStatus("error");
      }
    }
  }, [previewBrowserHandle]);

  const connectDropped = useCallback(
    async (dataTransfer: DataTransfer) => {
      const fileItems = [...dataTransfer.items].filter(
        (x) => x.kind === "file"
      );
      if (dataTransfer.files.length > 1 || fileItems.length > 1) {
        setPendingConnection(null);
        setError("Connect one JSON file at a time.");
        setStatus("error");
        return;
      }
      let text = "";
      try {
        text = singleDroppedPath(dataTransfer.getData("text/plain"));
      } catch (dropError) {
        setPendingConnection(null);
        setError(
          dropError instanceof Error
            ? dropError.message
            : "Connect one JSON file at a time."
        );
        setStatus("error");
        return;
      }
      if (text && (text.endsWith(".json") || text.includes("\\") || text.includes("/"))) {
        setPathState(text);
        await previewPath(text);
        return;
      }
      const item = fileItems[0];
      const handle = item?.getAsFileSystemHandle
        ? await item.getAsFileSystemHandle()
        : null;
      if (isBrowserFileHandle(handle)) {
        setPathState("");
        await previewBrowserHandle(handle);
        return;
      }
      setError("Drop a JSON file with browser file access, or paste its path.");
      setStatus("error");
    },
    [previewBrowserHandle, previewPath]
  );

  const requestBrowserWrite = useCallback(async (handle: BrowserFileHandle) => {
    if (handle.requestPermission) {
      const permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted")
        throw new Error("Write permission was not granted for this file.");
      return;
    }
    if (!handle.createWritable)
      throw new Error("This browser did not provide write access for the selected file.");
  }, []);

  const connectPending = useCallback(async () => {
    if (!pendingConnection) return;
    setError(null);
    setStatus("loading");
    try {
      const next = pendingConnection.normalized;
      lastFileJson.current = serializeDoc(next);
      if (pendingConnection.kind === "path") {
        setBoundFile({
          path: pendingConnection.path,
          mtimeMs: pendingConnection.mtimeMs,
          size: pendingConnection.size,
        });
        setBrowserFile(null);
      } else {
        await requestBrowserWrite(pendingConnection.handle);
        setBoundFile(null);
        setBrowserFile({
          name: pendingConnection.sourceName,
          lastModified: pendingConnection.lastModified,
          size: pendingConnection.size,
          handle: pendingConnection.handle,
        });
      }
      setPendingConnection(null);
      commit(next, undefined, false);
      onConnected();
      settleStatus("watching");
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Could not connect file."
      );
      setStatus("error");
    }
  }, [commit, onConnected, pendingConnection, requestBrowserWrite, settleStatus]);

  useEffect(() => {
    if ((!boundFile && !browserFile) || readingFile.current) return;
    const contents = serializeDoc(doc);
    if (contents === lastFileJson.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      saveTimer.current = null;
      try {
        if (boundFile) {
          const data = await postFileApi<LocalFileStat>("write", {
            path: boundFile.path,
            contents,
          });
          setBoundFile(data);
        } else if (browserFile?.handle.createWritable) {
          const writable = await browserFile.handle.createWritable();
          await writable.write(contents.endsWith("\n") ? contents : `${contents}\n`);
          await writable.close();
          const file = await browserFile.handle.getFile();
          setBrowserFile({
            ...browserFile,
            lastModified: file.lastModified,
            size: file.size,
          });
        } else {
          throw new Error("This connection cannot write back. Paste a local path instead.");
        }
        lastFileJson.current = contents;
        setError(null);
        settleStatus("saved");
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : "Could not save file."
        );
        setStatus("error");
      }
    }, 700);
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [boundFile, browserFile, doc, settleStatus]);

  useEffect(() => {
    if (!boundFile) return;
    let alive = true;
    const poll = async () => {
      if (readingFile.current || saveTimer.current) return;
      try {
        const data = await postFileApi<LocalFileStat>("stat", {
          path: boundFile.path,
        });
        if (!alive) return;
        if (Math.abs(data.mtimeMs - boundFile.mtimeMs) > 1)
          await loadPath(boundFile.path, "watch");
      } catch (watchError) {
        if (!alive) return;
        setError(
          watchError instanceof Error
            ? watchError.message
            : "Could not watch file."
        );
        setStatus("error");
      }
    };
    const id = window.setInterval(poll, 1400);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [boundFile, loadPath]);

  useEffect(() => {
    if (!browserFile) return;
    let alive = true;
    const poll = async () => {
      if (readingFile.current || saveTimer.current) return;
      try {
        const file = await browserFile.handle.getFile();
        if (!alive) return;
        if (Math.abs(file.lastModified - browserFile.lastModified) > 1)
          await connectBrowserHandle(browserFile.handle, "watch");
      } catch (watchError) {
        if (!alive) return;
        setError(
          watchError instanceof Error
            ? watchError.message
            : "Could not watch file."
        );
        setStatus("error");
      }
    };
    const id = window.setInterval(poll, 1400);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [browserFile, connectBrowserHandle]);

  const setPath = useCallback((nextPath: string) => {
    setPathState(nextPath);
    setError(null);
  }, []);

  const clearPreview = useCallback(() => {
    setPathState("");
    setPendingConnection(null);
    setError(null);
    setStatus("idle");
  }, []);

  const reportError = useCallback((message: string) => {
    setError(message);
    setStatus("error");
  }, []);

  const disconnect = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setBoundFile(null);
    setBrowserFile(null);
    setStatus("idle");
    setError(null);
    setPendingConnection(null);
    onDisconnected();
  }, [onDisconnected]);

  return {
    path,
    status,
    error,
    preview,
    connected,
    connectionName,
    setPath,
    clearPreview,
    browseFile,
    connectDropped,
    connectPending,
    disconnect,
    reportError,
  };
}
