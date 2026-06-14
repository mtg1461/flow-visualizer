"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionPreview, FileSyncStatus } from "@/components/ConnectionScreen";
import type { FlowFile } from "@/lib/types";
import { parseFlowFile } from "@/lib/parse";
import {
  denormalize,
  normalize,
  tidyLayout,
} from "@/lib/graph";
import { LOCAL_FILES_ENABLED } from "@/lib/config";

/** Remembers the last connected disk path so a dev refresh reconnects.
 *  Path connections only exist when LOCAL_FILES_ENABLED, so this is inert
 *  on a hosted build. Browser-handle connections aren't restorable here. */
const LAST_PATH_KEY = "flow-visualizer:lastPath";

/** Starter document written when the user creates a new empty flow file. */
const EMPTY_FLOW: FlowFile = {
  views: [
    {
      id: "main",
      title: "Untitled flow",
      steps: [{ id: "step-1", title: "New step", kind: "process" }],
    },
  ],
};

function rememberPath(p: string) {
  if (!LOCAL_FILES_ENABLED) return;
  try {
    localStorage.setItem(LAST_PATH_KEY, p);
  } catch {
    // storage unavailable — reconnect-on-refresh simply won't happen
  }
}

function forgetPath() {
  try {
    localStorage.removeItem(LAST_PATH_KEY);
  } catch {
    // ignore
  }
}

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
      normalized: FlowFile;
      sourceName: string;
    })
  | {
      kind: "browser";
      normalized: FlowFile;
      sourceName: string;
      lastModified: number;
      size: number;
      handle: BrowserFileHandle;
    }
  | {
      kind: "example";
      normalized: FlowFile;
      sourceName: string;
    };

declare global {
  interface Window {
    showOpenFilePicker?: (options?: unknown) => Promise<BrowserFileHandle[]>;
    showSaveFilePicker?: (options?: unknown) => Promise<BrowserFileHandle>;
  }

  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<BrowserFileHandle | { kind?: string }>;
  }
}

interface Options {
  file: FlowFile;
  activeViewId: string;
  commit: (next: FlowFile, coalesceKey?: string, stabilize?: boolean) => void;
  onConnected: (viewId: string) => void;
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

function prepareFile(file: FlowFile): FlowFile {
  return {
    views: file.views.map((view) => tidyLayout(normalize(view))),
  };
}

function serializeDoc(file: FlowFile) {
  return JSON.stringify(
    { views: file.views.map((view) => denormalize(view)) },
    null,
    2
  );
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
  canRequestWrite: boolean,
  file: FlowFile
): ConnectionPreview {
  return {
    sourceName,
    canRequestWrite,
    views: file.views.map((view) => ({
      id: view.id,
      title: view.title,
      summary: view.summary,
      stepCount: view.steps.length,
    })),
  };
}

export function useFileConnection({
  file,
  activeViewId,
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
  // demo mode: the canvas is open on the built-in example with no file bound,
  // so nothing saves back to disk and nothing is polled.
  const [exampleMode, setExampleMode] = useState(false);

  const lastFileJson = useRef(serializeDoc(file));
  const saveTimer = useRef<number | null>(null);
  const readingFile = useRef(false);

  const connected = !!boundFile || !!browserFile || exampleMode;
  const connectionName =
    boundFile?.path ?? browserFile?.name ?? (exampleMode ? "Example flow" : "");
  const preview = useMemo(
    () =>
      pendingConnection
        ? toConnectionPreview(
            pendingConnection.sourceName,
            pendingConnection.kind === "browser" &&
              !!pendingConnection.handle.requestPermission,
            pendingConnection.normalized
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

  const viewIdFor = useCallback(
    (next: FlowFile) =>
      next.views.some((view) => view.id === activeViewId)
        ? activeViewId
        : next.views[0].id,
    [activeViewId]
  );

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
      const result = parseFlowFile(data.contents);
      if (!result.ok) throw new Error(result.error);
      const normalized = prepareFile(result.data);
      setPendingConnection({
        ...data,
        kind: "path",
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
      const result = parseFlowFile(await file.text());
      if (!result.ok) throw new Error(result.error);
      const normalized = prepareFile(result.data);
      setPendingConnection({
        kind: "browser",
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
        const result = parseFlowFile(data.contents);
        if (!result.ok) throw new Error(result.error);
        const next = prepareFile(result.data);
        lastFileJson.current = serializeDoc(next);
        setPathState(data.path);
        setBoundFile({
          path: data.path,
          mtimeMs: data.mtimeMs,
          size: data.size,
        });
        setBrowserFile(null);
        setExampleMode(false);
        rememberPath(data.path);
        commit(next, undefined, false);
        onConnected(viewIdFor(next));
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
    [commit, onConnected, path, settleStatus, viewIdFor]
  );

  // Re-offer the last disk path after a refresh. The user still chooses which
  // view to open, so reconnect follows the same selector path as fresh opens.
  const triedReconnect = useRef(false);
  useEffect(() => {
    if (triedReconnect.current || !LOCAL_FILES_ENABLED) return;
    triedReconnect.current = true;
    let saved = "";
    try {
      saved = localStorage.getItem(LAST_PATH_KEY) ?? "";
    } catch {
      saved = "";
    }
    if (saved) setPathState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const result = parseFlowFile(await file.text());
        if (!result.ok) throw new Error(result.error);
        const next = prepareFile(result.data);
        lastFileJson.current = serializeDoc(next);
        setBoundFile(null);
        setExampleMode(false);
        setBrowserFile({
          name: handle.name || file.name || "flow.json",
          lastModified: file.lastModified,
          size: file.size,
          handle,
        });
        commit(next, undefined, false);
        onConnected(viewIdFor(next));
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
    [commit, onConnected, settleStatus, viewIdFor]
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

  // Create a new flow: the user picks a location (which grants write
  // permission), we seed it with a starter doc, then connect to it.
  const createEmpty = useCallback(async () => {
    if (!window.showSaveFilePicker) {
      setError("Creating a file needs browser file access (a Chromium-based browser).");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "flow.json",
        types: [
          { description: "JSON files", accept: { "application/json": [".json"] } },
        ],
      });
      if (!isBrowserFileHandle(handle) || !handle.createWritable)
        throw new Error("This browser cannot write to the chosen file.");
      const writable = await handle.createWritable();
      await writable.write(`${serializeDoc(EMPTY_FLOW)}\n`);
      await writable.close();
      setPathState("");
      await previewBrowserHandle(handle);
    } catch (createError) {
      const name = createError instanceof Error ? createError.name : "";
      if (name === "AbortError") return; // user dismissed the picker
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create the file."
      );
      setStatus("error");
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
      if (
        LOCAL_FILES_ENABLED &&
        text &&
        (text.endsWith(".json") || text.includes("\\") || text.includes("/"))
      ) {
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

  const connectPending = useCallback(async (selectedViewId: string) => {
    if (!pendingConnection) return;
    setError(null);
    setStatus("loading");
    try {
      const next = pendingConnection.normalized;
      const nextViewId = next.views.some((view) => view.id === selectedViewId)
        ? selectedViewId
        : next.views[0].id;
      lastFileJson.current = serializeDoc(next);
      if (pendingConnection.kind === "path") {
        setBoundFile({
          path: pendingConnection.path,
          mtimeMs: pendingConnection.mtimeMs,
          size: pendingConnection.size,
        });
        setBrowserFile(null);
        setExampleMode(false);
        rememberPath(pendingConnection.path);
      } else if (pendingConnection.kind === "browser") {
        await requestBrowserWrite(pendingConnection.handle);
        setBoundFile(null);
        setExampleMode(false);
        setBrowserFile({
          name: pendingConnection.sourceName,
          lastModified: pendingConnection.lastModified,
          size: pendingConnection.size,
          handle: pendingConnection.handle,
        });
      } else {
        setBoundFile(null);
        setBrowserFile(null);
        setExampleMode(true);
        forgetPath();
      }
      setPendingConnection(null);
      commit(next, undefined, false);
      onConnected(nextViewId);
      settleStatus(pendingConnection.kind === "example" ? "example" : "watching");
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Could not connect file."
      );
      setStatus("error");
    }
  }, [commit, onConnected, pendingConnection, requestBrowserWrite, settleStatus]);

  // Preview the built-in example, fetched from the server, with no file bound.
  const loadExample = useCallback(async () => {
    setError(null);
    setStatus("loading");
    try {
      const res = await fetch("/api/example", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the example flow.");
      const result = parseFlowFile(await res.text());
      if (!result.ok) throw new Error(result.error);
      setPendingConnection({
        kind: "example",
        sourceName: "Example flow",
        normalized: prepareFile(result.data),
      });
      setStatus("watching");
    } catch (exampleError) {
      setError(
        exampleError instanceof Error
          ? exampleError.message
          : "Could not load the example flow."
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if ((!boundFile && !browserFile) || readingFile.current) return;
    const contents = serializeDoc(file);
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
  }, [boundFile, browserFile, file, settleStatus]);

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
        if (Math.abs(data.mtimeMs - boundFile.mtimeMs) > 1) {
          await loadPath(boundFile.path, "watch");
        } else {
          // a clean poll clears a stale transient error (e.g. the dev server
          // was momentarily restarting), so the toolbar leaves "Issue"
          setStatus((s) => (s === "error" ? "watching" : s));
          setError((e) => (e ? null : e));
        }
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
        if (Math.abs(file.lastModified - browserFile.lastModified) > 1) {
          await connectBrowserHandle(browserFile.handle, "watch");
        } else {
          setStatus((s) => (s === "error" ? "watching" : s));
          setError((e) => (e ? null : e));
        }
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

  const disconnect = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setPathState("");
    setBoundFile(null);
    setBrowserFile(null);
    setExampleMode(false);
    setStatus("idle");
    setError(null);
    setPendingConnection(null);
    forgetPath();
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
    createEmpty,
    connectDropped,
    connectPending,
    loadExample,
    disconnect,
  };
}
