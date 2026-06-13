# AGENTS.md

Unfold — a tile-based 2D flow editor for AI-agent explanations. Next.js 15
(App Router) · TypeScript · Tailwind v4 · lucide-react. No graph/canvas
library: tiles are absolutely-positioned divs over one SVG edge layer inside
a single pan/zoom transform. Animations are CSS-only (framer-motion was
removed deliberately — do not reintroduce it).

## Commands

- `npm run dev` — the user usually runs this themselves (port 4400).
- `npm run typecheck` — run after every change; there are no tests or lint.
- Never run `npm run build` while a dev server is serving — the shared
  `.next` dir corrupts and the dev server starts returning 500s.

## Map

| Path | Role |
| --- | --- |
| `lib/types.ts` | `Explanation` — the JSON contract agents produce |
| `lib/graph.ts` | All geometry: layout, edge building, orthogonal routing, label placement, tidy, group-conflict repair |
| `components/Editor.tsx` | State owner; undo/redo; every mutation goes through `commit()` |
| `components/Canvas.tsx` | Pan/zoom surface, tile/group dragging, edge + label rendering |
| `components/Inspector.tsx` | Right panel: step / edge / group / doc editing |
| `hooks/useFileConnection.ts` | Disk sync via `app/api/file/*` routes |
| `lib/prompt.ts` | Agent-facing schema prompt (Copy Prompt button) |
| `examples/` | Reference documents (`thermostat.json`, `live-flow.json`) |

## Invariants

- **normalize/denormalize**: implicit step-to-step flow is materialized into
  explicit `then` on load and stripped again on export. The editor only ever
  deals in explicit edges; exported JSON stays minimal for agents.
- **All mutations go through `Editor.commit()`** (undo/redo stacks, 1s
  coalescing per key). Never set doc state directly.
- **Tool-managed fields**: `step.grid`, `group.grid`, edge colors/line
  styles. Agents writing JSON omit them; never require them.
- **Canvas rules 1–5** (README): pinned tiles stay; groups anchor members;
  membership is coverage; previews tell the truth; Tidy is the escape hatch.
  Group regions never overlap; a tile belongs to at most one group.
- **Routing is geometric, not narrative**: `routeEdges` picks paths from
  tile positions only — descending edges run through row gutters into the
  target's top; climbing edges take the cheaper side channel and enter
  through the target's near side, never its top. Array order only decides
  the amber "feedback" styling (`backward`). Edges must never cross tile
  interiors, and labels slide along their own segment to dodge tiles.
- Keep contrast high: dark premium UI, but the user has rejected
  low-contrast/dim surfaces twice. Solid panel backgrounds, bright edges.

## Verifying geometry changes

Routing/layout changes can be verified headlessly: import from `lib/graph.ts`
in a throwaway script (`node --experimental-strip-types`), route the example
docs, and assert no path segment enters a tile rect and label rects don't
overlap tiles. Browser screenshots from the preview webview are unreliable
(hidden visibility throttles rAF/timers); prefer geometric assertions or
`preview_eval`.

## Disk API & hosting posture

`app/api/file/{read,stat,write}` resolve client-supplied **absolute** paths on
purpose — Unfold is a local single-user tool and the point is to open a flow
file anywhere on your machine. Guards: only `.json` paths are touched
(`resolveLocalPath` in `_shared.ts`), reads/writes are capped at
`MAX_FILE_BYTES` (8 MB), and `npm run dev` binds to `127.0.0.1`.

**The disk API is gated off in production** (`LOCAL_FILES_ENABLED` in
`lib/config.ts`, default-deny when `NODE_ENV === "production"`). On a hosted
build (e.g. Vercel) the three routes return 403 and the connection screen
hides the path field — users open files through the browser File System Access
path instead (`useFileConnection` `createWritable` handles, which never touch
this API and are write-capable; Chromium-only). `LOCAL_FILES_ENABLED` is the
single source of truth, read by both the server routes and the client
(ConnectionScreen UI, drop-path branch, dev-only path auto-reconnect). To run a
**local production build** with path access, set
`NEXT_PUBLIC_UNFOLD_LOCAL_FILES=1` (re-enables both API and UI). Never set it on
a shared deployment — there is still no auth or root confinement behind the
gate.

Known hosted gaps (deliberately not yet built): browser-handle connections are
not restored across a refresh (would need IndexedDB + a permission re-prompt);
non-Chromium browsers can't load a file at all on a hosted build (no
`showOpenFilePicker`/`getAsFileSystemHandle`) — a read-only `<input type=file>`
fallback would close that.

## Gotchas

- Windows repo: never bulk-edit sources via PowerShell `Get-Content`/
  `Set-Content` pipelines — it mangles UTF-8. Use proper edit tooling.
- localStorage key is `unfold:data`; the app opens a connection screen
  unless a document is present.
- Grid coordinates can be negative (`GRID_LIMITS`: cols −12..60, rows
  −24..120); don't assume 0-origin.
