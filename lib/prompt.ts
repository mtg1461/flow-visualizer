const FLOW_SCHEMA_PROMPT = `Model the system as one or more directed flow views, not linear checklists. Capture real shape: forks where paths diverge, merges where paths rejoin, and feedback where a later step changes something earlier.

Use this JSON shape (output valid JSON only — no comments, no trailing commas):
{
  "views": [
    {
      "id": "short-view-slug",
      "title": "How <subject> works",
      "summary": "One sentence naming the core mechanism.",
      "actors": [
        { "id": "short-slug", "name": "Actor name", "role": "what it owns or decides" }
      ],
      "steps": [
        {
          "id": "short-slug",
          "title": "Short verb phrase",
          "detail": "One or two plain sentences: what happens and why it matters downstream.",
          "kind": "input | process | decision | output | wait",
          "actor": "actor-id",
          "branches": [{ "when": "condition in plain words", "to": "step-id" }],
          "then": "step-id"
        }
      ],
      "loops": [{ "from": "step-id", "to": "step-id", "label": "what feeds back" }],
      "groups": [{ "id": "short-slug", "label": "Phase or subsystem", "steps": ["step-id"] }]
    }
  ]
}

How to model it well:
- Always wrap flows in the top-level "views" array. A file with one flow still has one view.
- Use multiple views only when the subject has distinct perspectives that would be crowded in one chart, such as request lifecycle, data model, and background jobs.
- Steps flow to the next listed step automatically — omit "then" for plain sequence. Set "then" only to jump elsewhere: skip ahead, merge two paths into one step, or loop back.
- Make decisions real forks: "kind": "decision" with 2-3 mutually exclusive "branches", each leading to a DIFFERENT step so the paths actually diverge. Let those paths run a few steps, then rejoin with a shared "then" if they merge. A step that always continues to one place is a process, not a decision.
- Use "loops" (or a backward "then"/branch) only for genuine feedback — a later outcome that revises earlier state. One or two is normal; do not wire a loop from every step.
- "input" is the trigger, "output" the result, "wait" pauses for an external event; everything else is "process". Give each step the actor that performs it.
- Cluster related steps into "groups" by phase or subsystem when two or more belong together.
- Keep each view tight and honest: roughly 6-14 steps, stable lowercase unique ids, every referenced id present, no orphan steps.
- Omit layout and styling fields: step/group "grid", step/group color overrides, and edge color/line overrides. The app and user handle placement and coloring.`;

export const RECEIVE_RESPONSE_PROMPT = `Explain how the system works as one or more visual flow views. Return only valid JSON — no markdown fences, no prose.

${FLOW_SCHEMA_PROMPT}`;

export const WRITE_PROJECT_PROMPT = `Explain how the system works as one or more visual flow views, saved as a JSON file in this project.

Write it to docs/<short-topic>-flow.json (create the folder if needed) unless the repo already has a better place for generated docs. After writing, reply with just the file path.

${FLOW_SCHEMA_PROMPT}`;
