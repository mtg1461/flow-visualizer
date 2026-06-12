"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EdgeLine, Explanation, Step } from "@/lib/types";
import { parseExplanation } from "@/lib/parse";
import {
  GRID_LIMITS,
  type EdgeRef,
  type Pos,
  type Selection,
  cellInRect,
  groupCellRect,
  denormalize,
  layoutPositions,
  nearestFreeCell,
  normalize,
  rectsOverlap,
  resolveGroupConflicts,
  tidyLayout,
  type CellRect,
} from "@/lib/graph";
import { Canvas } from "./Canvas";
import { ContextMenu, type MenuState } from "./ContextMenu";
import { Inspector, type EditorActions } from "./Inspector";
import { Toolbar } from "./Toolbar";
import {
  ConnectionScreen,
  type ConnectionPreview,
  type FileSyncStatus,
} from "./ConnectionScreen";
import { DisconnectDialog } from "./DisconnectDialog";
import { SCHEMA_PROMPT } from "@/lib/prompt";

export const STORAGE_KEY = "unfold:data";

const HISTORY_LIMIT = 100;
/** Edits with the same coalesce key inside this window share one undo entry. */
const COALESCE_MS = 1000;

interface Props {
  initial: Explanation;
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

function singleDroppedPath(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1)
    throw new Error("Connect one JSON file at a time.");
  return lines[0] ?? "";
}

function persist(doc: Explanation | null) {
  try {
    if (doc) localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable — edits still live for this session
  }
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

/**
 * Canvas ruleset, rule 2: groups anchor their members. A tile inside a
 * group must never move because something OUTSIDE the group changed —
 * auto-layout positions tiles relative to their predecessors, so without
 * this, dragging a connected outside tile reflows unpinned members and
 * stretches the group. Every commit pins unpinned members at the cell
 * they occupied before the mutation. Tidy and JSON-apply bypass this on
 * purpose: they are the explicit "re-layout everything" actions.
 */
function stabilizeGroupMembers(
  next: Explanation,
  prevPos: Map<string, Pos>
): Explanation {
  const memberIds = new Set((next.groups ?? []).flatMap((g) => g.steps));
  if (memberIds.size === 0) return next;
  let changed = false;
  const steps = next.steps.map((s) => {
    if (!memberIds.has(s.id) || s.grid) return s;
    const p = prevPos.get(s.id);
    if (!p) return s;
    changed = true;
    return { ...s, grid: { col: p.col, row: p.row } };
  });
  return changed ? { ...next, steps } : next;
}

function rectToGrid(rect: {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}) {
  return {
    col: rect.minC,
    row: rect.minR,
    cols: rect.maxC - rect.minC + 1,
    rows: rect.maxR - rect.minR + 1,
  };
}

/** Drops a selection that points at something the restored doc lacks. */
function validSelection(
  doc: Explanation,
  sel: Selection | null
): Selection | null {
  if (!sel) return null;
  if (sel.kind === "step")
    return doc.steps.some((s) => s.id === sel.id) ? sel : null;
  if (sel.kind === "group")
    return doc.groups?.some((g) => g.id === sel.id) ? sel : null;
  const ref = sel.ref;
  if (ref.type === "flow")
    return doc.steps.find((s) => s.id === ref.from)?.then ? sel : null;
  if (ref.type === "branch")
    return (doc.steps.find((s) => s.id === ref.from)?.branches?.length ?? 0) >
      ref.index
      ? sel
      : null;
  return (doc.loops?.length ?? 0) > ref.index ? sel : null;
}

export function Editor({ initial }: Props) {
  const [doc, setDocState] = useState<Explanation>(() => normalize(initial));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [pendingConnection, setPendingConnection] =
    useState<PendingConnection | null>(null);
  const [boundFile, setBoundFile] = useState<LocalFileStat | null>(null);
  const [browserFile, setBrowserFile] =
    useState<BrowserFileConnection | null>(null);
  const [fileStatus, setFileStatus] = useState<FileSyncStatus>("idle");
  const [fileError, setFileError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);

  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<Explanation[]>([]);
  const future = useRef<Explanation[]>([]);
  const lastCommit = useRef({ key: "", at: 0 });
  const lastFileJson = useRef(serializeDoc(doc));
  const saveTimer = useRef<number | null>(null);
  const readingFile = useRef(false);

  const commit = useCallback(
    (next: Explanation, coalesceKey?: string, stabilize = true) => {
      if (stabilize)
        next = stabilizeGroupMembers(next, layoutPositions(docRef.current));
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
    []
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(past.current.length > 0);
    setDocState(prev);
    persist(prev);
    setSelection((s) => validSelection(prev, s));
    setConnectFrom(null);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    lastCommit.current = { key: "", at: 0 };
    setCanUndo(true);
    setDocState(next);
    persist(next);
    setSelection((s) => validSelection(next, s));
    setConnectFrom(null);
  }, []);

  const positions = useMemo(() => layoutPositions(doc), [doc]);
  const connected = !!boundFile || !!browserFile;
  const connectionName = boundFile?.path ?? browserFile?.name ?? "";
  const preview = pendingConnection
    ? toConnectionPreview(
        pendingConnection.sourceName,
        pendingConnection.preview,
        pendingConnection.kind === "browser" &&
          !!pendingConnection.handle.requestPermission
      )
    : null;

  /* ------------------------------------------------------- mutations */

  const updateStep = useCallback(
    (id: string, patch: Partial<Step>) => {
      const d = docRef.current;
      commit(
        {
          ...d,
          steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        },
        `step:${id}:${Object.keys(patch).sort().join(",")}`
      );
    },
    [commit]
  );

  const deleteStep = useCallback(
    (id: string) => {
      const d = docRef.current;
      if (d.steps.length <= 1) return;
      const dying = d.steps.find((s) => s.id === id);
      const heal = dying?.then && dying.then !== id ? dying.then : undefined;
      commit({
        ...d,
        steps: d.steps
          .filter((s) => s.id !== id)
          .map((s) => ({
            ...s,
            then: s.then === id ? heal : s.then,
            branches: s.branches
              ?.map((b) => (b.to === id && heal ? { ...b, to: heal } : b))
              .filter((b) => b.to !== id),
          })),
        loops: d.loops?.filter((l) => l.from !== id && l.to !== id),
        groups: d.groups
          ?.map((g) => ({ ...g, steps: g.steps.filter((s) => s !== id) }))
          .filter((g) => g.steps.length > 0 || g.grid),
      });
      setSelection(null);
    },
    [commit]
  );

  const addStep = useCallback(
    (opts?: { afterId?: string; cell?: Pos }) => {
      const d = docRef.current;
      let n = d.steps.length + 1;
      while (d.steps.some((s) => s.id === `step-${n}`)) n++;
      const id = `step-${n}`;

      const afterId =
        opts?.afterId ??
        (opts?.cell ? null : selection?.kind === "step" ? selection.id : null);
      let cell: Pos;
      if (opts?.cell) {
        cell = nearestFreeCell(positions, opts.cell.col, opts.cell.row);
      } else {
        const anchor = afterId
          ? positions.get(afterId)
          : [...positions.values()].reduce<Pos | null>(
              (acc, p) => (!acc || p.row > acc.row ? p : acc),
              null
            );
        cell = nearestFreeCell(
          positions,
          anchor?.col ?? 0,
          (anchor?.row ?? -1) + 1
        );
      }

      const newStep: Step = { id, title: "New step", kind: "process", grid: cell };
      let steps: Step[];
      if (afterId) {
        // insert into the flow after the anchor step
        const i = d.steps.findIndex((s) => s.id === afterId);
        const sel = d.steps[i];
        const inherited = !sel.branches?.length ? sel.then : undefined;
        steps = [...d.steps];
        steps[i] = inherited ? { ...sel, then: id } : sel;
        steps.splice(
          i + 1,
          0,
          inherited ? { ...newStep, then: inherited } : newStep
        );
      } else {
        steps = [...d.steps, newStep];
      }
      // a step born inside a region belongs to it
      const home = (d.groups ?? []).find((g) => {
        const rect = groupCellRect(g, positions);
        return rect && cellInRect(rect, cell);
      });
      const groups = home
        ? d.groups?.map((g) =>
            g.id === home.id ? { ...g, steps: [...g.steps, id] } : g
          )
        : d.groups;
      commit({ ...d, steps, groups });
      setSelection({ kind: "step", id });
    },
    [commit, selection, positions]
  );

  const moveNode = useCallback(
    (id: string, cell: Pos) => {
      const d = docRef.current;
      const pos = layoutPositions(d);
      const oldCell = pos.get(id);
      const containing = (c: Pos | undefined) =>
        c
          ? (d.groups ?? []).find((g) => {
              const rect = groupCellRect(g, pos);
              return rect && cellInRect(rect, c);
            })
          : undefined;
      // membership changes only when the drag CROSSES a region boundary,
      // so manual assignments made in the inspector stick
      const newG = containing(cell);
      const oldG = containing(oldCell);
      let groups = d.groups;
      if (newG?.id !== oldG?.id) {
        const next = (d.groups ?? [])
          .map((g) => {
            const isMember = g.steps.includes(id);
            let steps = g.steps;
            if (isMember && g.id !== newG?.id)
              steps = steps.filter((s) => s !== id);
            else if (!isMember && g.id === newG?.id) steps = [...steps, id];
            if (steps === g.steps) return g;
            // a group losing its last member keeps its footprint as a region
            if (steps.length === 0 && !g.grid) {
              const rect = groupCellRect(g, pos);
              return {
                ...g,
                steps,
                grid: rect ? rectToGrid(rect) : undefined,
              };
            }
            return { ...g, steps };
          })
          .filter((g) => g.steps.length > 0 || g.grid);
        groups = next.length ? next : undefined;
      }
      commit(
        {
          ...d,
          steps: d.steps.map((s) =>
            s.id === id ? { ...s, grid: cell } : s
          ),
          groups,
        },
        `step:${id}:grid`
      );
    },
    [commit]
  );

  const moveGroup = useCallback(
    (id: string, dCol: number, dRow: number, mode: "all" | "region") => {
      const d = docRef.current;
      const g = d.groups?.find((x) => x.id === id);
      if (!g || (!dCol && !dRow)) return;
      const pos = layoutPositions(d);

      const inOtherGroup = (sid: string) =>
        (d.groups ?? []).some((x) => x.id !== id && x.steps.includes(sid));
      const otherRects = (d.groups ?? [])
        .filter((x) => x.id !== id)
        .map((x) => groupCellRect(x, pos))
        .filter((r): r is CellRect => !!r);

      if (mode === "region") {
        // move only the box; membership re-derives from the new footprint
        const rect = groupCellRect(g, pos);
        if (!rect) return;
        const base = g.grid ?? rectToGrid(rect);
        const ng = { ...base, col: base.col + dCol, row: base.row + dRow };
        if (
          ng.col < GRID_LIMITS.minCol ||
          ng.col + ng.cols - 1 > GRID_LIMITS.maxCol ||
          ng.row < GRID_LIMITS.minRow ||
          ng.row + ng.rows - 1 > GRID_LIMITS.maxRow
        )
          return;
        const ngRect = {
          minC: ng.col,
          maxC: ng.col + ng.cols - 1,
          minR: ng.row,
          maxR: ng.row + ng.rows - 1,
        };
        if (otherRects.some((o) => rectsOverlap(ngRect, o))) return;
        const inside = (p: Pos) =>
          p.col >= ng.col &&
          p.col <= ng.col + ng.cols - 1 &&
          p.row >= ng.row &&
          p.row <= ng.row + ng.rows - 1;
        // covered tiles belong, unless they belong to another group
        const steps = d.steps
          .filter((s) => {
            const p = pos.get(s.id);
            if (!p || !inside(p)) return false;
            return g.steps.includes(s.id) || !inOtherGroup(s.id);
          })
          .map((s) => s.id);
        commit({
          ...d,
          groups: d.groups?.map((x) =>
            x.id === id ? { ...x, grid: ng, steps } : x
          ),
        });
        return;
      }

      // moving the group takes everything visually inside the box —
      // stray non-members sitting in the region are adopted
      const members = new Set(g.steps);
      const rect = groupCellRect(g, pos);
      if (rect) {
        const shifted = {
          minC: rect.minC + dCol,
          maxC: rect.maxC + dCol,
          minR: rect.minR + dRow,
          maxR: rect.maxR + dRow,
        };
        if (otherRects.some((o) => rectsOverlap(shifted, o))) return;
      }
      if (rect) {
        for (const s of d.steps) {
          if (members.has(s.id) || inOtherGroup(s.id)) continue;
          const p = pos.get(s.id);
          if (p && cellInRect(rect, p)) members.add(s.id);
        }
      }
      for (const sid of members) {
        const p = pos.get(sid);
        if (!p) continue;
        const c = p.col + dCol;
        const r = p.row + dRow;
        if (
          c < GRID_LIMITS.minCol ||
          c > GRID_LIMITS.maxCol ||
          r < GRID_LIMITS.minRow ||
          r > GRID_LIMITS.maxRow
        )
          return;
        for (const [oid, op] of pos)
          if (!members.has(oid) && op.col === c && op.row === r) return;
      }
      commit({
        ...d,
        steps: d.steps.map((s) => {
          if (!members.has(s.id)) return s;
          const p = pos.get(s.id);
          if (!p) return s;
          return { ...s, grid: { col: p.col + dCol, row: p.row + dRow } };
        }),
        groups: d.groups?.map((x) =>
          x.id === id
            ? {
                ...x,
                steps: [...members],
                grid: x.grid
                  ? {
                      ...x.grid,
                      col: x.grid.col + dCol,
                      row: x.grid.row + dRow,
                    }
                  : undefined,
              }
            : x
        ),
      });
    },
    [commit]
  );

  const resizeGroup = useCallback(
    (id: string, grid: { col: number; row: number; cols: number; rows: number }) => {
      const d = docRef.current;
      const g = d.groups?.find((x) => x.id === id);
      if (!g) return;
      const pos = layoutPositions(d);
      const rect = {
        minC: grid.col,
        maxC: grid.col + grid.cols - 1,
        minR: grid.row,
        maxR: grid.row + grid.rows - 1,
      };
      const inOtherGroup = (sid: string) =>
        (d.groups ?? []).some((x) => x.id !== id && x.steps.includes(sid));
      // regions never overlap — reject a resize that crosses another group
      const eff = groupCellRect({ ...g, grid }, pos);
      const otherRects = (d.groups ?? [])
        .filter((x) => x.id !== id)
        .map((x) => groupCellRect(x, pos))
        .filter((r): r is CellRect => !!r);
      if (eff && otherRects.some((o) => rectsOverlap(eff, o))) return;
      // the resized footprint adopts the tiles it now covers
      const adopted = d.steps
        .filter((s) => {
          if (g.steps.includes(s.id) || inOtherGroup(s.id)) return false;
          const p = pos.get(s.id);
          return p && cellInRect(rect, p);
        })
        .map((s) => s.id);
      commit(
        {
          ...d,
          groups: d.groups?.map((x) =>
            x.id === id
              ? { ...x, grid, steps: [...x.steps, ...adopted] }
              : x
          ),
        },
        `group:${id}:grid`
      );
    },
    [commit]
  );

  const addGroupAt = useCallback(
    (cell: Pos) => {
      const d = docRef.current;
      const existing = d.groups ?? [];
      let n = existing.length + 1;
      while (existing.some((g) => g.id === `group-${n}`)) n++;
      const id = `group-${n}`;
      // place the new region at the nearest spot that overlaps no region
      const pos = layoutPositions(d);
      const others = existing
        .map((g) => groupCellRect(g, pos))
        .filter((r): r is CellRect => !!r);
      const fits = (c: number, r: number) =>
        c >= GRID_LIMITS.minCol &&
        c + 1 <= GRID_LIMITS.maxCol &&
        r >= GRID_LIMITS.minRow &&
        r + 1 <= GRID_LIMITS.maxRow &&
        !others.some((o) =>
          rectsOverlap({ minC: c, maxC: c + 1, minR: r, maxR: r + 1 }, o)
        );
      let spot: Pos | null = fits(cell.col, cell.row) ? cell : null;
      for (let dd = 1; dd <= 20 && !spot; dd++) {
        for (let dr = -dd; dr <= dd && !spot; dr++) {
          for (let dc = -dd; dc <= dd && !spot; dc++) {
            if (Math.abs(dr) + Math.abs(dc) !== dd) continue;
            if (fits(cell.col + dc, cell.row + dr))
              spot = { col: cell.col + dc, row: cell.row + dr };
          }
        }
      }
      if (!spot) return;
      commit({
        ...d,
        groups: [
          ...existing,
          {
            id,
            label: `Group ${n}`,
            steps: [],
            grid: { col: spot.col, row: spot.row, cols: 2, rows: 2 },
          },
        ],
      });
      setSelection({ kind: "group", id });
    },
    [commit]
  );

  const completeConnect = useCallback(
    (to: string) => {
      const from = connectFrom;
      setConnectFrom(null);
      if (!from || from === to) return;
      const d = docRef.current;
      const src = d.steps.find((s) => s.id === from);
      if (!src) return;
      if (src.kind === "decision") {
        if (src.branches?.some((b) => b.to === to)) return;
        const branches = [...(src.branches ?? []), { when: "when…", to }];
        updateStep(from, { branches });
        setSelection({
          kind: "edge",
          ref: { type: "branch", from, index: branches.length - 1 },
        });
      } else if (!src.then) {
        updateStep(from, { then: to });
        setSelection({ kind: "edge", ref: { type: "flow", from } });
      } else if (src.then === to) {
        setSelection({ kind: "edge", ref: { type: "flow", from } });
      } else {
        // the flow edge exists — additional connections become loop entries
        const loops = [...(d.loops ?? []), { from, to }];
        commit({ ...d, loops });
        setSelection({
          kind: "edge",
          ref: { type: "loop", index: loops.length - 1 },
        });
      }
    },
    [connectFrom, updateStep, commit]
  );

  const deleteEdge = useCallback(
    (ref: EdgeRef) => {
      const d = docRef.current;
      if (ref.type === "flow") {
        updateStep(ref.from, { then: undefined });
      } else if (ref.type === "branch") {
        const src = d.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).filter((_, i) => i !== ref.index);
        updateStep(ref.from, {
          branches: branches.length ? branches : undefined,
        });
      } else {
        commit({ ...d, loops: d.loops?.filter((_, i) => i !== ref.index) });
      }
      setSelection(null);
    },
    [updateStep, commit]
  );

  const updateEdgeLabel = useCallback(
    (ref: EdgeRef, label: string) => {
      const d = docRef.current;
      if (ref.type === "branch") {
        const src = d.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).map((b, i) =>
          i === ref.index ? { ...b, when: label } : b
        );
        updateStep(ref.from, { branches });
      } else if (ref.type === "loop") {
        commit(
          {
            ...d,
            loops: d.loops?.map((l, i) =>
              i === ref.index ? { ...l, label: label || undefined } : l
            ),
          },
          `loop-label:${ref.index}`
        );
      } else {
        updateStep(ref.from, { thenLabel: label || undefined });
      }
    },
    [updateStep, commit]
  );

  const updateEdgeStyle = useCallback(
    (ref: EdgeRef, patch: { color?: string | null; line?: EdgeLine | null }) => {
      const d = docRef.current;
      const color =
        patch.color === undefined ? undefined : (patch.color ?? undefined);
      const line =
        patch.line === undefined ? undefined : (patch.line ?? undefined);
      const apply = <T extends { color?: string; line?: EdgeLine }>(o: T): T => ({
        ...o,
        ...("color" in patch ? { color } : {}),
        ...("line" in patch ? { line } : {}),
      });
      if (ref.type === "branch") {
        const src = d.steps.find((s) => s.id === ref.from);
        const branches = (src?.branches ?? []).map((b, i) =>
          i === ref.index ? apply(b) : b
        );
        updateStep(ref.from, { branches });
      } else if (ref.type === "loop") {
        commit(
          {
            ...d,
            loops: d.loops?.map((l, i) => (i === ref.index ? apply(l) : l)),
          },
          `loop-style:${ref.index}`
        );
      } else {
        updateStep(ref.from, {
          ...("color" in patch ? { thenColor: color } : {}),
          ...("line" in patch ? { thenLine: line } : {}),
        });
      }
    },
    [updateStep, commit]
  );

  const tidy = useCallback(() => {
    const d = docRef.current;
    // rule 5: Tidy is the explicit re-layout — skip member stabilization
    const next = tidyLayout(d);
    if (JSON.stringify(next) !== JSON.stringify(d))
      commit(next, undefined, false);
    setFitSignal((s) => s + 1);
  }, [commit]);

  const settleFileStatus = useCallback((status: FileSyncStatus) => {
    setFileStatus(status);
    if (status === "saved" || status === "external") {
      window.setTimeout(() => {
        setFileStatus((current) =>
          current === status ? "watching" : current
        );
      }, 1300);
    }
  }, []);

  const previewPath = useCallback(async (path: string) => {
    const wanted = path.trim();
    if (!wanted) {
      setPendingConnection(null);
      setFileError(null);
      setFileStatus("idle");
      return;
    }
    setFileError(null);
    setFileStatus("loading");
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
      setFileStatus("watching");
    } catch (error) {
      setPendingConnection(null);
      setFileError(error instanceof Error ? error.message : "Could not preview file.");
      setFileStatus("error");
    }
  }, []);

  const previewBrowserHandle = useCallback(async (handle: BrowserFileHandle) => {
    if (handle.kind && handle.kind !== "file") {
      setPendingConnection(null);
      setFileError("Drop or browse to a JSON file.");
      setFileStatus("error");
      return;
    }
    setFileError(null);
    setFileStatus("loading");
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
      setFileStatus("watching");
    } catch (error) {
      setPendingConnection(null);
      setFileError(error instanceof Error ? error.message : "Could not preview file.");
      setFileStatus("error");
    }
  }, []);

  useEffect(() => {
    if (connected) return;
    const wanted = filePath.trim();
    if (!wanted) {
      setPendingConnection((current) =>
        current?.kind === "path" ? null : current
      );
      setFileError(null);
      setFileStatus("idle");
      return;
    }
    const id = window.setTimeout(() => previewPath(wanted), 450);
    return () => window.clearTimeout(id);
  }, [connected, filePath, previewPath]);

  const loadFile = useCallback(
    async (path = filePath, source: "manual" | "watch" = "manual") => {
      const wanted = path.trim();
      if (!wanted) {
        setFileError("Enter a local JSON file path.");
        setFileStatus("error");
        return;
      }
      readingFile.current = true;
      setFileError(null);
      setFileStatus(source === "watch" ? "external" : "loading");
      try {
        const data = await postFileApi<LocalFileRead>("read", { path: wanted });
        const result = parseExplanation(data.contents);
        if (!result.ok) throw new Error(result.error);
        const next = resolveGroupConflicts(normalize(result.data));
        lastFileJson.current = serializeDoc(next);
        setFilePath(data.path);
        setBoundFile({
          path: data.path,
          mtimeMs: data.mtimeMs,
          size: data.size,
        });
        setBrowserFile(null);
        setLastSyncedAt(Date.now());
        commit(next, undefined, false);
        setSelection(null);
        setConnectFrom(null);
        setFitSignal((s) => s + 1);
        settleFileStatus(source === "watch" ? "external" : "watching");
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "Could not open file.");
        setFileStatus("error");
      } finally {
        window.setTimeout(() => {
          readingFile.current = false;
        }, 0);
      }
    },
    [commit, filePath, settleFileStatus]
  );

  const connectBrowserHandle = useCallback(
    async (
      handle: BrowserFileHandle,
      source: "manual" | "watch" = "manual"
    ) => {
      if (handle.kind && handle.kind !== "file") {
        setFileError("Drop or browse to a JSON file.");
        setFileStatus("error");
        return;
      }
      readingFile.current = true;
      setFileError(null);
      setFileStatus(source === "watch" ? "external" : "loading");
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
        setLastSyncedAt(Date.now());
        commit(next, undefined, false);
        setSelection(null);
        setConnectFrom(null);
        setFitSignal((s) => s + 1);
        settleFileStatus(source === "watch" ? "external" : "watching");
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "Could not open file.");
        setFileStatus("error");
      } finally {
        window.setTimeout(() => {
          readingFile.current = false;
        }, 0);
      }
    },
    [commit, settleFileStatus]
  );

  const browseFile = useCallback(async () => {
    if (!window.showOpenFilePicker) {
      setFileError("Browse needs browser file access. Paste a local path instead.");
      setFileStatus("error");
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
        setFilePath("");
        await previewBrowserHandle(handle);
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name !== "AbortError") {
        setFileError(error instanceof Error ? error.message : "Could not browse file.");
        setFileStatus("error");
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
        setFileError("Connect one JSON file at a time.");
        setFileStatus("error");
        return;
      }
      let text = "";
      try {
        text = singleDroppedPath(dataTransfer.getData("text/plain"));
      } catch (error) {
        setPendingConnection(null);
        setFileError(error instanceof Error ? error.message : "Connect one JSON file at a time.");
        setFileStatus("error");
        return;
      }
      if (text && (text.endsWith(".json") || text.includes("\\") || text.includes("/"))) {
        setFilePath(text);
        await previewPath(text);
        return;
      }
      const item = fileItems[0];
      const handle = item?.getAsFileSystemHandle
        ? await item.getAsFileSystemHandle()
        : null;
      if (isBrowserFileHandle(handle)) {
        setFilePath("");
        await previewBrowserHandle(handle);
        return;
      }
      setFileError("Drop a JSON file with browser file access, or paste its path.");
      setFileStatus("error");
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
    setFileError(null);
    setFileStatus("loading");
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
      setLastSyncedAt(Date.now());
      commit(next, undefined, false);
      setSelection(null);
      setConnectFrom(null);
      setFitSignal((s) => s + 1);
      settleFileStatus("watching");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not connect file.");
      setFileStatus("error");
    }
  }, [commit, pendingConnection, requestBrowserWrite, settleFileStatus]);

  useEffect(() => {
    if ((!boundFile && !browserFile) || readingFile.current) return;
    const contents = serializeDoc(doc);
    if (contents === lastFileJson.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setFileStatus("saving");
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
        setLastSyncedAt(Date.now());
        setFileError(null);
        settleFileStatus("saved");
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "Could not save file.");
        setFileStatus("error");
      }
    }, 700);
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [boundFile, browserFile, doc, settleFileStatus]);

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
          await loadFile(boundFile.path, "watch");
      } catch (error) {
        if (!alive) return;
        setFileError(error instanceof Error ? error.message : "Could not watch file.");
        setFileStatus("error");
      }
    };
    const id = window.setInterval(poll, 1400);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [boundFile, loadFile]);

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
      } catch (error) {
        if (!alive) return;
        setFileError(error instanceof Error ? error.message : "Could not watch file.");
        setFileStatus("error");
      }
    };
    const id = window.setInterval(poll, 1400);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [browserFile, connectBrowserHandle]);

  const disconnect = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setBoundFile(null);
    setBrowserFile(null);
    setFileStatus("idle");
    setFileError(null);
    setLastSyncedAt(null);
    setSelection(null);
    setConnectFrom(null);
    setMenu(null);
    setDisconnectOpen(false);
  }, []);

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(SCHEMA_PROMPT);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1600);
    } catch {
      setFileError("Could not copy the prompt.");
      setFileStatus("error");
    }
  }, []);

  const actions: EditorActions = useMemo(
    () => ({
      updateDoc: (patch) =>
        commit(
          { ...docRef.current, ...patch },
          `doc:${Object.keys(patch).sort().join(",")}`
        ),
      updateStep,
      deleteStep,
      startConnect: (id) => setConnectFrom(id),
      deleteEdge,
      updateEdgeLabel,
      updateEdgeStyle,
      addActor: (name) => {
        const d = docRef.current;
        const base =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "actor";
        let id = base;
        let n = 2;
        while ((d.actors ?? []).some((p) => p.id === id)) id = `${base}-${n++}`;
        commit({ ...d, actors: [...(d.actors ?? []), { id, name }] });
      },
      updateActor: (id, patch) => {
        const d = docRef.current;
        commit(
          {
            ...d,
            actors: d.actors?.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          },
          `actor:${id}:${Object.keys(patch).sort().join(",")}`
        );
      },
      deleteActor: (id) => {
        const d = docRef.current;
        commit({
          ...d,
          actors: d.actors?.filter((p) => p.id !== id),
          steps: d.steps.map((s) =>
            s.actor === id ? { ...s, actor: undefined } : s
          ),
        });
      },
      assignGroup: (stepId, groupId) => {
        const d = docRef.current;
        const pos = layoutPositions(d);
        let groups = (d.groups ?? []).map((g) => {
          if (!g.steps.includes(stepId)) return g;
          const steps = g.steps.filter((s) => s !== stepId);
          // keep the region when the last member is removed by hand
          if (steps.length === 0 && !g.grid && g.id !== groupId) {
            const rect = groupCellRect(g, pos);
            return { ...g, steps, grid: rect ? rectToGrid(rect) : undefined };
          }
          return { ...g, steps };
        });
        if (groupId === "__new__") {
          let n = groups.length + 1;
          while (groups.some((g) => g.id === `group-${n}`)) n++;
          groups.push({ id: `group-${n}`, label: `Group ${n}`, steps: [stepId] });
        } else if (groupId) {
          groups = groups.map((g) =>
            g.id === groupId ? { ...g, steps: [...g.steps, stepId] } : g
          );
        }
        const kept = groups.filter((g) => g.steps.length > 0 || g.grid);
        commit({ ...d, groups: kept.length ? kept : undefined });
      },
      updateGroup: (id, patch) => {
        const d = docRef.current;
        commit(
          {
            ...d,
            groups: d.groups?.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          },
          `group:${id}:${Object.keys(patch).sort().join(",")}`
        );
      },
      deleteGroup: (id) => {
        const d = docRef.current;
        const groups = d.groups?.filter((g) => g.id !== id);
        commit({ ...d, groups: groups?.length ? groups : undefined });
      },
    }),
    [commit, updateStep, deleteStep, deleteEdge, updateEdgeLabel, updateEdgeStyle]
  );

  /* -------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // undo/redo work everywhere, including form fields — their values
      // are doc state, so this is the only undo that makes sense
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === "function" &&
        target.closest("input, textarea, select")
      )
        return;
      if (e.key === "Escape") {
        if (connectFrom) setConnectFrom(null);
        else setSelection(null);
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selection &&
        !disconnectOpen
      ) {
        e.preventDefault();
        if (selection.kind === "step") deleteStep(selection.id);
        else if (selection.kind === "group") actions.deleteGroup(selection.id);
        else deleteEdge(selection.ref);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, connectFrom, disconnectOpen, deleteStep, deleteEdge, undo, redo, actions]);

  /* ---------------------------------------------------------- render */

  if (!connected) {
    return (
      <ConnectionScreen
        path={filePath}
        status={fileStatus}
        error={fileError}
        preview={preview}
        onPathChange={(path) => {
          setFilePath(path);
          setFileError(null);
        }}
        onConnectPreview={connectPending}
        onClearPreview={() => {
          setFilePath("");
          setPendingConnection(null);
          setFileError(null);
          setFileStatus("idle");
        }}
        onBrowse={browseFile}
        onDropConnection={connectDropped}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <Toolbar
        title={doc.title}
        connectionName={connectionName}
        status={fileStatus}
        canUndo={canUndo}
        onUndo={undo}
        onTidy={tidy}
        onTitle={(title) => commit({ ...doc, title }, "doc:title")}
        onCopyPrompt={copyPrompt}
        promptCopied={promptCopied}
        onDisconnect={() => setDisconnectOpen(true)}
      />
      <div className="relative min-h-0 flex-1">
        <Canvas
          doc={doc}
          positions={positions}
          selection={selection}
          connectFrom={connectFrom}
          fitSignal={fitSignal}
          onSelect={setSelection}
          onClearSelection={() => setSelection(null)}
          onMoveNode={moveNode}
          onMoveGroup={moveGroup}
          onResizeGroup={resizeGroup}
          onStartConnect={setConnectFrom}
          onCompleteConnect={completeConnect}
          onCancelConnect={() => setConnectFrom(null)}
          onMenu={(target, x, y) => setMenu({ target, x, y })}
        />
        <Inspector doc={doc} selection={selection} actions={actions} />
        {menu && (
          <ContextMenu
            menu={menu}
            currentColor={
              menu.target.type === "tile"
                ? doc.steps.find(
                    (s) => s.id === (menu.target as { id: string }).id
                  )?.color
                : menu.target.type === "group"
                  ? (doc.groups?.find(
                      (g) => g.id === (menu.target as { id: string }).id
                    )?.color ?? "#9b9bff")
                  : undefined
            }
            canDelete={doc.steps.length > 1}
            onClose={() => setMenu(null)}
            onAddAfter={(id) => addStep({ afterId: id })}
            onAddAt={(cell) => addStep({ cell })}
            onAddGroupAt={addGroupAt}
            onConnect={(id) => setConnectFrom(id)}
            onColor={(id, color) => updateStep(id, { color })}
            onGroupColor={(id, color) => actions.updateGroup(id, { color })}
            onUngroup={(id) => actions.deleteGroup(id)}
            onDeleteStep={deleteStep}
            onDeleteEdge={deleteEdge}
          />
        )}
      </div>
      <DisconnectDialog
        open={disconnectOpen}
        connectionName={connectionName}
        onCancel={() => setDisconnectOpen(false)}
        onConfirm={disconnect}
      />
    </div>
  );
}
