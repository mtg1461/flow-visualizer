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
- Steps can be clustered into dashed group regions (`groups` in the JSON, or
  the Group select in the inspector); each step can carry a custom color.
- With nothing selected the inspector edits the summary, moving parts, and
  groups. `Delete` removes the selection, `Esc` deselects.
- Everything autosaves to `localStorage`; **JSON → Copy JSON** exports the
  current state, edits included.

The data shape is `Explanation` in [lib/types.ts](lib/types.ts). Layout,
edge-building, and orthogonal routing live in [lib/graph.ts](lib/graph.ts).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · lucide-react

No canvas/graph library — tiles are absolutely-positioned divs over one SVG
edge layer in a panned/zoomed transform. Animations are pure CSS.
