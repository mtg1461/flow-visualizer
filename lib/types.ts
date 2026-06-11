/** The shape an AI agent produces to describe how something works. */

export type StepKind = "input" | "process" | "decision" | "output" | "wait";

export interface Part {
  id: string;
  name: string;
  /** One short phrase: what this part is responsible for. */
  role?: string;
}

export interface Branch {
  /** Condition in plain language, e.g. "evidence is strong". */
  when: string;
  /** Step id this condition leads to. */
  to: string;
}

export interface Step {
  id: string;
  /** Short headline, under ~60 chars. */
  title: string;
  /** One or two plain sentences explaining what happens and why. */
  detail?: string;
  kind?: StepKind;
  /** Part id of the moving part performing this step. */
  part?: string;
  /** What flows into this step. */
  inputs?: string[];
  /** What flows out of this step. */
  outputs?: string[];
  /** Decision steps: where each condition leads. */
  branches?: Branch[];
  /** Explicit next step when flow does not continue to the following step. */
  then?: string;
  /** Optional caveat or aside. */
  note?: string;
  /** Tile position on the canvas. Managed by the tool — agents omit it. */
  grid?: { col: number; row: number };
  /** Custom accent color (hex). Overrides the kind color. */
  color?: string;
}

export interface Group {
  id: string;
  /** Region label, e.g. "Retrieval subsystem". */
  label: string;
  color?: string;
  /** Member step ids. */
  steps: string[];
}

export interface Loop {
  from: string;
  to: string;
  /** What feeds back, e.g. "click data tunes ranking over time". */
  label?: string;
}

export interface Explanation {
  title: string;
  /** The essence in one sentence. */
  summary?: string;
  parts?: Part[];
  steps: Step[];
  /** System-level feedback loops beyond step-to-step flow. */
  loops?: Loop[];
  /** Labeled regions clustering related steps. */
  groups?: Group[];
}
