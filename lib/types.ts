/** The shape an AI agent produces to describe how something works. */

export type StepKind =
  | "trigger"
  | "input"
  | "process"
  | "decision"
  | "output"
  | "wait";

export interface Actor {
  id: string;
  name: string;
  /** One short phrase: what this actor is responsible for. */
  role?: string;
}

export type EdgeLine = "solid" | "dashed" | "dotted";

export interface Branch {
  /** Condition in plain language, e.g. "evidence is strong". */
  when: string;
  /** Step id this condition leads to. */
  to: string;
  /** Custom edge color (hex). Tool-managed. */
  color?: string;
  /** Custom line style. Tool-managed. */
  line?: EdgeLine;
}

export interface Step {
  id: string;
  /** Short headline, under ~60 chars. */
  title: string;
  /** One or two plain sentences explaining what happens and why. */
  detail?: string;
  kind?: StepKind;
  /** Actor id performing this step. */
  actor?: string;
  /** Decision steps: where each condition leads. */
  branches?: Branch[];
  /** Explicit next step when flow does not continue to the following step. */
  then?: string;
  /** Optional label on the outgoing flow edge. Tool-managed. */
  thenLabel?: string;
  /** Custom color for the outgoing flow edge. Tool-managed. */
  thenColor?: string;
  /** Custom line style for the outgoing flow edge. Tool-managed. */
  thenLine?: EdgeLine;
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
  /** Explicit region in grid cells — lets a group exist before it has
   *  members. Tool-managed; agents omit it. */
  grid?: { col: number; row: number; cols: number; rows: number };
}

export interface Loop {
  from: string;
  to: string;
  /** What feeds back, e.g. "click data tunes ranking over time". */
  label?: string;
  /** Custom edge color (hex). Tool-managed. */
  color?: string;
  /** Custom line style. Tool-managed. */
  line?: EdgeLine;
}

export interface Explanation {
  title: string;
  /** The essence in one sentence. */
  summary?: string;
  actors?: Actor[];
  steps: Step[];
  /** System-level feedback loops beyond step-to-step flow. */
  loops?: Loop[];
  /** Labeled regions clustering related steps. */
  groups?: Group[];
}

export type FlowView = Explanation & {
  /** Stable id for this view inside a multi-view flow file. */
  id: string;
};

export interface FlowFile {
  views: FlowView[];
}
