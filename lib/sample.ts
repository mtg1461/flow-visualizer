import type { FlowFile } from "./types";

export const SAMPLE: FlowFile = {
  views: [
    {
      id: "coding-agent",
      title: "How a coding agent ships a feature",
      summary:
        "A request becomes a plan, the plan becomes code, and a loop of tests and review keeps rewriting that code until both the machine and the human say yes.",
      actors: [
        { id: "user", name: "You", role: "asks and approves" },
        { id: "agent", name: "Agent", role: "reads, plans, writes" },
        { id: "codebase", name: "Codebase", role: "the ground truth" },
        { id: "tests", name: "Test suite", role: "the machine judge" },
      ],
      steps: [
        {
          id: "request",
          title: "A feature request arrives",
          detail:
            "One or two sentences of intent. Everything downstream is the agent translating this into working code.",
          kind: "trigger",
          actor: "user",
          then: "explore",
        },
        {
          id: "explore",
          title: "The agent reads the codebase",
          detail:
            "Search, open files, follow imports. The goal is a mental model: where the change belongs and what it might break.",
          kind: "process",
          actor: "agent",
          then: "plan",
        },
        {
          id: "plan",
          title: "A plan takes shape",
          detail:
            "Which files to touch, in what order, and what could go wrong. Cheap to fix here, expensive to fix later.",
          kind: "process",
          actor: "agent",
          then: "edit",
        },
        {
          id: "edit",
          title: "Code gets written",
          detail:
            "The plan turns into edits. Small, reviewable changes that match the style of the code around them.",
          kind: "process",
          actor: "agent",
          then: "test",
        },
        {
          id: "test",
          title: "The test suite runs",
          detail:
            "Compile, lint, unit tests. The machine gets the first vote on whether the change is real progress.",
          kind: "process",
          actor: "tests",
          then: "verdict",
        },
        {
          id: "verdict",
          title: "Do the tests pass?",
          kind: "decision",
          actor: "tests",
          branches: [
            { when: "all green", to: "review" },
            { when: "something fails", to: "diagnose" },
          ],
        },
        {
          id: "diagnose",
          title: "The failure points at the bug",
          detail:
            "Read the failing output, form a hypothesis, and go back to the code with a sharper idea of what is wrong.",
          kind: "process",
          actor: "agent",
          then: "edit",
        },
        {
          id: "review",
          title: "Does the human approve?",
          kind: "decision",
          actor: "user",
          branches: [
            { when: "looks right", to: "ship" },
            { when: "changes requested", to: "edit" },
          ],
        },
        {
          id: "ship",
          title: "The change lands on main",
          detail:
            "Committed, merged, done. The feature exists now, and so does its weight on every future change.",
          kind: "output",
          actor: "codebase",
        },
      ],
      loops: [
        {
          from: "ship",
          to: "explore",
          label: "every merged change reshapes the codebase the next task reads",
        },
      ],
      groups: [
        {
          id: "thinking",
          label: "Thinking",
          color: "#7fd6c2",
          steps: ["explore", "plan"],
        },
        {
          id: "build-loop",
          label: "Build loop",
          color: "#9b9bff",
          steps: ["edit", "test", "verdict", "diagnose"],
        },
      ],
    },
  ],
};
