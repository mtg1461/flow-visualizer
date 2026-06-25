"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionPreview, FileSyncStatus } from "@/components/ConnectionScreen";
import type { FlowFile } from "@/lib/types";
import { parseFlowFile } from "@/lib/parse";
import {
  denormalize,
  normalize,
  tidyPreservingLayout,
} from "@/lib/graph";
import { LOCAL_FILES_ENABLED } from "@/lib/config";

/** Remembers the last connected disk path so a dev refresh reconnects.
 *  Path connections only exist when LOCAL_FILES_ENABLED, so this is inert
 *  on a hosted build. Browser-handle connections aren't restorable here. */
export const LAST_PATH_KEY = "flow-visualizer:lastPath";
const SAVE_DEBOUNCE_MS = 1500;

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

type FileSnapshot =
  | {
      kind: "path";
      sourceName: string;
      meta: LocalFileStat;
      normalized: FlowFile;
      json: string;
      updatedAt: number;
    }
  | {
      kind: "browser";
      sourceName: string;
      meta: BrowserFileConnection;
      normalized: FlowFile;
      json: string;
      updatedAt: number;
    };

interface SyncConflict {
  sourceName: string;
  detectedAt: number;
  externalUpdatedAt: number;
  snapshot: FileSnapshot;
}

export interface FileConflictPreview {
  sourceName: string;
  detectedAt: number;
  externalUpdatedAt: number;
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
      saveAccess: "needed" | "ready";
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
    views: file.views.map((view) => tidyPreservingLayout(normalize(view))),
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
  body: {
    path: string;
    contents?: string;
    expectedMtimeMs?: number;
    expectedSize?: number;
    force?: boolean;
  }
): Promise<T> {
  const response = await fetch(`/api/file/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        typeof data?.error === "string" ? data.error : "File operation failed."
      ),
      { status: response.status }
    );
  return data as T;
}

function canonicalizeContents(contents: string) {
  const result = parseFlowFile(contents);
  if (!result.ok) throw new Error(result.error);
  const normalized = prepareFile(result.data);
  return {
    normalized,
    json: serializeDoc(normalized),
  };
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

async function browserSaveAccessState(
  handle: BrowserFileHandle
): Promise<"needed" | "ready"> {
  if (!handle.createWritable) return "needed";
  if (handle.queryPermission) {
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") return "ready";
  }
  return handle.requestPermission ? "needed" : "ready";
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
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  // demo mode: the canvas is open on the built-in example with no file bound,
  // so nothing saves back to disk and nothing is polled.
  const [exampleMode, setExampleMode] = useState(false);

  const fileRef = useRef(file);
  const lastFileJson = useRef(serializeDoc(file));
  const saveTimer = useRef<number | null>(null);
  const readingFile = useRef(false);

  fileRef.current = file;

  const connected = !!boundFile || !!browserFile || exampleMode;
  const connectionName =
    boundFile?.path ?? browserFile?.name ?? (exampleMode ? "Example flow" : "");
  const preview = useMemo(
    () =>
      pendingConnection
        ? toConnectionPreview(
            pendingConnection.sourceName,
            pendingConnection.kind === "browser" &&
              pendingConnection.saveAccess === "needed",
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

  const readPathSnapshot = useCallback(
    async (filePath: string): Promise<FileSnapshot> => {
      const data = await postFileApi<LocalFileRead>("read", { path: filePath });
      const canonical = canonicalizeContents(data.contents);
      return {
        kind: "path",
        sourceName: data.path,
        meta: {
          path: data.path,
          mtimeMs: data.mtimeMs,
          size: data.size,
        },
        normalized: canonical.normalized,
        json: canonical.json,
        updatedAt: data.mtimeMs,
      };
    },
    []
  );

  const readBrowserSnapshot = useCallback(
    async (connection: {
      name: string;
      handle: BrowserFileHandle;
    }): Promise<FileSnapshot> => {
      const file = await connection.handle.getFile();
      const canonical = canonicalizeContents(await file.text());
      const meta: BrowserFileConnection = {
        name: connection.name || file.name || "flow.json",
        lastModified: file.lastModified,
        size: file.size,
        handle: connection.handle,
      };
      return {
        kind: "browser",
        sourceName: meta.name,
        meta,
        normalized: canonical.normalized,
        json: canonical.json,
        updatedAt: file.lastModified,
      };
    },
    []
  );

  const updateConnectionFromSnapshot = useCallback((snapshot: FileSnapshot) => {
    if (snapshot.kind === "path") {
      setBoundFile(snapshot.meta);
    } else {
      setBrowserFile(snapshot.meta);
    }
  }, []);

  const applySnapshot = useCallback(
    (snapshot: FileSnapshot, source: "manual" | "watch" = "watch") => {
      readingFile.current = true;
      lastFileJson.current = snapshot.json;
      setConflict(null);
      if (snapshot.kind === "path") {
        setPathState(snapshot.meta.path);
        setBoundFile(snapshot.meta);
        setBrowserFile(null);
        rememberPath(snapshot.meta.path);
      } else {
        setPathState("");
        setBoundFile(null);
        setBrowserFile(snapshot.meta);
      }
      setExampleMode(false);
      setLastSavedAt(null);
      commit(snapshot.normalized, undefined, false);
      onConnected(viewIdFor(snapshot.normalized));
      settleStatus(source === "watch" ? "external" : "watching");
      window.setTimeout(() => {
        readingFile.current = false;
      }, 0);
    },
    [commit, onConnected, settleStatus, viewIdFor]
  );

  const openConflict = useCallback((snapshot: FileSnapshot) => {
    setConflict({
      sourceName: snapshot.sourceName,
      detectedAt: Date.now(),
      externalUpdatedAt: snapshot.updatedAt,
      snapshot,
    });
    setError(null);
    setStatus("conflict");
  }, []);

  const handleExternalSnapshot = useCallback(
    (snapshot: FileSnapshot): "unchanged" | "reloaded" | "conflict" => {
      if (snapshot.json === lastFileJson.current) {
        updateConnectionFromSnapshot(snapshot);
        return "unchanged";
      }

      const currentJson = serializeDoc(fileRef.current);
      if (currentJson === lastFileJson.current) {
        applySnapshot(snapshot, "watch");
        return "reloaded";
      }

      openConflict(snapshot);
      return "conflict";
    },
    [applySnapshot, openConflict, updateConnectionFromSnapshot]
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
      const saveAccess = await browserSaveAccessState(handle);
      setPendingConnection({
        kind: "browser",
        normalized,
        sourceName: handle.name || file.name || "flow.json",
        lastModified: file.lastModified,
        size: file.size,
        handle,
        saveAccess,
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
    if (!handle.createWritable)
      throw new Error("This browser did not provide write access for the selected file.");
    if (handle.requestPermission) {
      const permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted")
        throw new Error("Write permission was not granted for this file.");
    }
  }, []);

  const requestPendingSaveAccess = useCallback(async () => {
    if (!pendingConnection || pendingConnection.kind !== "browser") return;
    setError(null);
    setStatus("loading");
    try {
      await requestBrowserWrite(pendingConnection.handle);
      setPendingConnection({
        ...pendingConnection,
        saveAccess: "ready",
      });
      setStatus("watching");
    } catch (permissionError) {
      setError(
        permissionError instanceof Error
          ? permissionError.message
          : "Could not get save permission."
      );
      setStatus("error");
    }
  }, [pendingConnection, requestBrowserWrite]);

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
        setLastSavedAt(null);
        rememberPath(pendingConnection.path);
      } else if (pendingConnection.kind === "browser") {
        if (pendingConnection.saveAccess !== "ready")
          await requestBrowserWrite(pendingConnection.handle);
        setBoundFile(null);
        setExampleMode(false);
        setLastSavedAt(null);
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
        setLastSavedAt(null);
        forgetPath();
      }
      setPendingConnection(null);
      setConflict(null);
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
    if ((!boundFile && !browserFile) || readingFile.current || conflict) return;
    const contents = serializeDoc(file);
    if (contents === lastFileJson.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setStatus("saving");
    saveTimer.current = window.setTimeout(async () => {
      saveTimer.current = null;
      try {
        const snapshot = boundFile
          ? await readPathSnapshot(boundFile.path)
          : browserFile
            ? await readBrowserSnapshot(browserFile)
            : null;
        if (snapshot) {
          const externalState = handleExternalSnapshot(snapshot);
          if (externalState !== "unchanged") return;
        }

        if (boundFile) {
          const expected =
            snapshot?.kind === "path" ? snapshot.meta : boundFile;
          const data = await postFileApi<LocalFileStat>("write", {
            path: boundFile.path,
            contents,
            expectedMtimeMs: expected.mtimeMs,
            expectedSize: expected.size,
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
        setLastSavedAt(Date.now());
        setError(null);
        settleStatus("saved");
      } catch (saveError) {
        if (
          boundFile &&
          typeof saveError === "object" &&
          saveError !== null &&
          (saveError as { status?: number }).status === 409
        ) {
          try {
            const snapshot = await readPathSnapshot(boundFile.path);
            handleExternalSnapshot(snapshot);
            return;
          } catch {
            // fall through to the original save error below
          }
        }
        setError(
          saveError instanceof Error ? saveError.message : "Could not save file."
        );
        setStatus("error");
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [
    boundFile,
    browserFile,
    conflict,
    file,
    handleExternalSnapshot,
    readBrowserSnapshot,
    readPathSnapshot,
    settleStatus,
  ]);

  useEffect(() => {
    if (!boundFile || conflict) return;
    let alive = true;
    const poll = async () => {
      if (readingFile.current || saveTimer.current) return;
      try {
        const data = await postFileApi<LocalFileStat>("stat", {
          path: boundFile.path,
        });
        if (!alive) return;
        if (
          Math.abs(data.mtimeMs - boundFile.mtimeMs) > 1 ||
          data.size !== boundFile.size
        ) {
          const snapshot = await readPathSnapshot(boundFile.path);
          if (!alive) return;
          const externalState = handleExternalSnapshot(snapshot);
          if (externalState === "unchanged") {
            setStatus((s) => (s === "error" ? "watching" : s));
            setError((e) => (e ? null : e));
          }
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
  }, [boundFile, conflict, handleExternalSnapshot, readPathSnapshot]);

  useEffect(() => {
    if (!browserFile || conflict) return;
    let alive = true;
    const poll = async () => {
      if (readingFile.current || saveTimer.current) return;
      try {
        const file = await browserFile.handle.getFile();
        if (!alive) return;
        if (
          Math.abs(file.lastModified - browserFile.lastModified) > 1 ||
          file.size !== browserFile.size
        ) {
          const snapshot = await readBrowserSnapshot(browserFile);
          if (!alive) return;
          const externalState = handleExternalSnapshot(snapshot);
          if (externalState === "unchanged") {
            setStatus((s) => (s === "error" ? "watching" : s));
            setError((e) => (e ? null : e));
          }
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
  }, [browserFile, conflict, handleExternalSnapshot, readBrowserSnapshot]);

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
    setLastSavedAt(null);
    setStatus("idle");
    setError(null);
    setConflict(null);
    setPendingConnection(null);
    forgetPath();
    onDisconnected();
  }, [onDisconnected]);

  const keepLocalChanges = useCallback(async () => {
    if (!conflict) return;
    const contents = serializeDoc(fileRef.current);
    setError(null);
    setStatus("saving");
    try {
      if (conflict.snapshot.kind === "path") {
        const data = await postFileApi<LocalFileStat>("write", {
          path: conflict.snapshot.meta.path,
          contents,
          force: true,
        });
        setPathState(data.path);
        setBoundFile(data);
        setBrowserFile(null);
        rememberPath(data.path);
      } else if (conflict.snapshot.meta.handle.createWritable) {
        const writable = await conflict.snapshot.meta.handle.createWritable();
        await writable.write(contents.endsWith("\n") ? contents : `${contents}\n`);
        await writable.close();
        const file = await conflict.snapshot.meta.handle.getFile();
        setBoundFile(null);
        setBrowserFile({
          ...conflict.snapshot.meta,
          lastModified: file.lastModified,
          size: file.size,
        });
      } else {
        throw new Error("This connection cannot write back. Paste a local path instead.");
      }
      lastFileJson.current = contents;
      setConflict(null);
      setLastSavedAt(Date.now());
      settleStatus("saved");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save file."
      );
      setStatus("error");
    }
  }, [conflict, settleStatus]);

  const reloadExternalChanges = useCallback(() => {
    if (!conflict) return;
    applySnapshot(conflict.snapshot, "watch");
  }, [applySnapshot, conflict]);

  return {
    path,
    status,
    error,
    lastSavedAt,
    conflict: conflict
      ? {
          sourceName: conflict.sourceName,
          detectedAt: conflict.detectedAt,
          externalUpdatedAt: conflict.externalUpdatedAt,
        }
      : null,
    preview,
    connected,
    connectionName,
    setPath,
    clearPreview,
    browseFile,
    createEmpty,
    connectDropped,
    requestPendingSaveAccess,
    connectPending,
    loadExample,
    disconnect,
    keepLocalChanges,
    reloadExternalChanges,
  };
}
