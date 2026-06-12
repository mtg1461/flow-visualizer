export const SCHEMA_PROMPT = `Create one JSON file that explains the system as a visual flow. Return only valid JSON, with no markdown or prose.

Use this shape:
{
  "title": "How ... works",
  "summary": "One sentence explaining the core mechanism.",
  "actors": [
    { "id": "short-slug", "name": "Actor name", "role": "what it controls or provides" }
  ],
  "steps": [
    {
      "id": "short-slug",
      "title": "Short action label",
      "detail": "One or two plain sentences: what happens and why it matters downstream.",
      "kind": "input | process | decision | output | wait",
      "actor": "actor-id",
      "branches": [{ "when": "condition", "to": "step-id" }],
      "then": "step-id"
    }
  ],
  "loops": [{ "from": "step-id", "to": "step-id", "label": "what feeds back" }],
  "groups": [{ "id": "short-slug", "label": "Subsystem name", "steps": ["step-id"] }]
}

Rules:
- Use 5 to 12 ordered steps for the main path.
- Use "input" for the starting trigger and "output" for the final result.
- Use "decision" plus 2 or 3 branches for real forks.
- Use "then" only when the next step is not simply the following item.
- Backward "then", backward branches, or "loops" represent retries and feedback.
- Keep ids stable, lowercase, and unique.
- Do not include layout or styling fields such as grid, color, or line.`;
