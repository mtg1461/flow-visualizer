export const SCHEMA_PROMPT = `Explain how the system we discussed works as a single JSON object, so it can be rendered as one visual flow. Output ONLY the JSON, no prose.

Schema (TypeScript):

interface Explanation {
  title: string;            // "How X works", under ~70 chars
  summary?: string;         // the essence in one sentence
  parts?: {                 // the moving parts involved
    id: string;
    name: string;
    role?: string;          // short phrase: what it is responsible for
  }[];
  steps: {                  // ordered sequence — the spine of the flow
    id: string;             // short slug, e.g. "embed"
    title: string;          // headline under ~60 chars, plain language
    detail?: string;        // 1–2 sentences: what happens and WHY it matters
    kind?: "input" | "process" | "decision" | "output" | "wait";
    part?: string;          // id of the part performing this step
    inputs?: string[];      // what flows in (1–3 short labels)
    outputs?: string[];     // what flows out (1–3 short labels)
    branches?: {            // decision steps only: where each condition leads
      when: string;         // plain-language condition, e.g. "cache hit"
      to: string;           // target step id (earlier id = a retry/loop)
    }[];
    then?: string;          // next step id when flow does NOT continue to the
                            // following step (earlier id = feedback loop)
    note?: string;          // optional caveat or aside
  }[];
  loops?: {                 // system-level feedback beyond step-to-step flow
    from: string;           // step id
    to: string;             // step id
    label?: string;         // what feeds back and what it changes
  }[];
}

Rules:
- 5–12 steps. Order them as the main path through the system.
- Mark the entry as kind "input" and the result as kind "output".
- Every fork in behaviour is a "decision" step with 2–3 branches.
- Retries and feedback go BACKWARD: a branch or "then" pointing to an
  earlier step id, or an entry in "loops".
- Plain language a newcomer understands. No jargon without a gloss in detail.
- Cause and effect live in "detail": say what the step changes downstream.`;
