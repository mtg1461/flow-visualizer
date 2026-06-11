import type { Explanation } from "./types";

export const SAMPLE: Explanation = {
  title: "How retrieval-augmented generation answers a question",
  summary:
    "A question is turned into meaning, matched against stored knowledge, and answered only from the evidence found — with checks that loop back when the evidence or the draft falls short.",
  parts: [
    { id: "user", name: "User", role: "asks and receives" },
    { id: "embedder", name: "Embedder", role: "turns words into vectors" },
    { id: "index", name: "Vector index", role: "stores knowledge by meaning" },
    { id: "llm", name: "Language model", role: "writes from evidence" },
    { id: "guard", name: "Groundedness check", role: "keeps answers honest" },
  ],
  steps: [
    {
      id: "ask",
      title: "A question arrives",
      detail:
        "The user asks in plain language. Nothing about the system is exposed — the question is the only input.",
      kind: "input",
      part: "user",
      inputs: ["question"],
    },
    {
      id: "embed",
      title: "The question becomes a vector",
      detail:
        "The embedder converts the words into a list of numbers that captures meaning, so 'reset my password' and 'can't log in' land close together.",
      kind: "process",
      part: "embedder",
      outputs: ["query vector"],
    },
    {
      id: "retrieve",
      title: "The closest passages are pulled",
      detail:
        "The index is searched for stored chunks whose vectors sit nearest the query vector — similarity in numbers stands in for similarity in meaning.",
      kind: "process",
      part: "index",
      outputs: ["top-k passages"],
    },
    {
      id: "judge",
      title: "Is the evidence strong enough?",
      detail:
        "Retrieved passages are scored for relevance before any writing happens. Weak evidence here is the root cause of most bad answers.",
      kind: "decision",
      part: "guard",
      branches: [
        { when: "evidence is strong", to: "compose" },
        { when: "evidence is thin", to: "rewrite" },
      ],
    },
    {
      id: "rewrite",
      title: "The query is rephrased",
      detail:
        "The model rewrites the question — expanding acronyms, splitting compound asks — and the search runs again with the sharper phrasing.",
      kind: "process",
      part: "llm",
      then: "embed",
      note: "Usually capped at one or two retries.",
    },
    {
      id: "compose",
      title: "The model writes from the evidence",
      detail:
        "The passages and the original question go into the prompt together. The model is instructed to answer only from what was retrieved.",
      kind: "process",
      part: "llm",
      inputs: ["question", "top-k passages"],
      outputs: ["draft answer"],
    },
    {
      id: "verify",
      title: "Does the draft stay grounded?",
      detail:
        "Each claim in the draft is checked against the passages it cites. Anything unsupported sends the draft back with a stricter prompt.",
      kind: "decision",
      part: "guard",
      branches: [
        { when: "claims are supported", to: "deliver" },
        { when: "claims drift from sources", to: "compose" },
      ],
    },
    {
      id: "deliver",
      title: "The answer returns with its sources",
      detail:
        "The user gets the answer plus the passages it was built from — the citations are the proof of work.",
      kind: "output",
      part: "user",
      outputs: ["answer + citations"],
    },
  ],
  loops: [
    {
      from: "deliver",
      to: "retrieve",
      label: "user feedback re-ranks passages over time",
    },
  ],
};
