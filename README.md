# Unfold

A tile-based 2D flow editor for AI-agent explanations. Paste an agent's
structured JSON description of how something works and it renders as an
auto-laid-out flow graph — tiles on a grid, decision branches fanning into
columns, feedback as dashed channels. Edit the graph directly and the JSON
updates with it.

Not draw.io, not a dashboard: one canvas, one inspector, one JSON contract.

## Run

```bash
npm install
npm run dev   # http://localhost:4400
```

## Use

- **File** (toolbar) opens a local JSON file, renders it, watches for edits
  from another process, and writes visual edits back to the same path. Try
  `examples\live-flow.json`, or an absolute path like
  `C:\Projects\other-project\flow.json`.
- **JSON** (toolbar) → **Schema prompt** → give it to your agent at the end of
  any "how does X work" conversation, then paste the JSON it returns and
  **Apply**. Try [examples/thermostat.json](examples/thermostat.json).
- Drag tiles to rearrange (positions persist via the optional `grid` field).
- Click a tile to edit it in the inspector; click its ○ port, then another
  tile, to connect. Decision steps grow condition branches; other steps get
  their next step, and further connections from the same tile become extra
  edges. Hover a tile to read its detail.
- Right-click a tile for quick actions (add after, connect, recolor, delete),
  the canvas to add a step at that spot, or an edge to delete it.
- Click any edge or its label to edit it fully: label, line style
  (solid/dashed/dotted), and color — defaults follow semantics (feedback is
  dashed amber) but every edge can be styled freely.
- Steps can be clustered into dashed group regions (`groups` in the JSON);
  each step can carry a custom color.
- With nothing selected the inspector edits the summary, actors, and
  groups. `Delete` removes the selection, `Esc` deselects.
- Everything autosaves to `localStorage`; a bound file also autosaves to disk.
  **JSON → Copy JSON** exports the current state, edits included.

The data shape is `Explanation` in [lib/types.ts](lib/types.ts). Layout,
edge-building, and orthogonal routing live in [lib/graph.ts](lib/graph.ts).

## Canvas rules

1. **Pinned tiles stay put; unpinned tiles flow.** Auto-layout only
   positions tiles you haven't placed yourself. Dragging a tile pins it.
2. **Groups anchor their members.** A tile inside a group never moves
   unless you move it or its group — reflows caused by edits outside the
   group can't stretch a region.
3. **Membership is coverage.** Group-level operations (move, resize,
   region-move, add-inside) adopt what the box covers and release what it
   doesn't. Inspector removals stay sticky until the next group operation
   or a drag across the boundary. Tiles are never poached from another
   group.
4. **Previews tell the truth.** What you see mid-drag is exactly what the
   drop produces.
5. **Tidy and JSON-apply re-layout.** They are the explicit escape hatches
   from rules 1–2: Tidy strips every pin (including group anchors), and
   applying pasted JSON trusts the document's own layout.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · lucide-react

No canvas/graph library — tiles are absolutely-positioned divs over one SVG
edge layer in a panned/zoomed transform. Animations are pure CSS.
