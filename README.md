# Unfold

A minimal visual explanation surface. Paste an AI agent's structured JSON
explanation of how something works and see it as one elegant flow — the moving
parts, the sequence, the decisions, the feedback loops, and what flows in and
out at every step.

Not an IDE, not a dashboard, not a diagram editor. One spine, read top to
bottom.

## Run

```bash
npm install
npm run dev   # http://localhost:4400
```

## Use

1. Click **Paste explanation** → **Copy the schema prompt**.
2. Give the prompt to your agent at the end of any "how does X work" conversation.
3. Paste the JSON it returns. The flow persists in `localStorage`.

The data shape is `Explanation` in [lib/types.ts](lib/types.ts): ordered
`steps` (the spine), `branches` on decision steps, backward references render
as dashed feedback arcs, and `loops` capture system-level feedback.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · framer-motion · lucide-react
