import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WorkflowEngine, type WorkflowDefinition } from "../../extension-core/workflow-engine";
import { WorkflowExtensionCore } from "../../extension-core/workflow-extension-core";

const TDD_WORKFLOW: WorkflowDefinition = {
  id: "tdd",
  name: "Test-Driven Development",
  description: "Red-green-refactor cycle for implementing features with tests first",
  phases: [
    {
      id: "red",
      label: "🔴 Write failing tests",
      execution: "sequential",
      tasks: [{
        agent: "testing-reviewer",
        task: [
          "Write failing tests that specify the intended behavior for: {input}",
          "",
          "Rules:",
          "- Write tests ONLY — do not write any implementation code",
          "- Tests must fail clearly when run (red phase of TDD)",
          "- Each test should specify one clear behavior",
          "- Use the project's existing test framework and conventions",
          "- Run the tests to confirm they fail",
        ].join("\n"),
      }],
      transition: { type: "advance" },
    },
    {
      id: "green",
      label: "🟢 Make tests pass",
      execution: "sequential",
      tasks: [{
        agent: "builder",
        task: [
          "Write the MINIMAL implementation to make the failing tests pass.",
          "",
          "Rules:",
          "- Do the simplest thing that could possibly work",
          "- Do not add features, optimizations, or abstractions beyond what tests require",
          "- Run the tests to confirm they all pass",
          "",
          "Failing tests from the red phase:",
          "{phase:red}",
        ].join("\n"),
      }],
      transition: { type: "advance" },
    },
    {
      id: "refactor",
      label: "🔵 Review & refactor",
      execution: "sequential",
      tasks: [{
        agent: "reviewer",
        task: [
          "Review and refactor the implementation for clarity, maintainability, and design quality.",
          "",
          "Rules:",
          "- Improve naming, structure, and readability",
          "- Extract duplication if warranted",
          "- Ensure all tests still pass after any refactoring",
          "- Do not add new behavior — only improve the design of existing code",
          "",
          "Full TDD cycle context:",
          "{context}",
        ].join("\n"),
      }],
      transition: { type: "advance" },
    },
  ],
};

class TddExtension extends WorkflowExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "tdd",
      name: "TDD Workflow",
      summary: "Red-green-refactor cycle",
    });
  }

  protected registerExtension(): void {
    const engine = new WorkflowEngine(this.pi, TDD_WORKFLOW);

    this.pi.registerCommand("tdd", {
      description: "Start a TDD workflow: write failing tests → implement → refactor",
      handler: async (args, ctx) => {
        const input = args.trim();
        if (!input) {
          ctx.ui.notify("Usage: /tdd <what to implement>", "error");
          return;
        }

        if (engine.isActive()) {
          ctx.ui.notify("A TDD workflow is already running. Wait for it to complete.", "warning");
          return;
        }

        engine.start(input, ctx);
      },
    });

    this.pi.registerCommand("tdd:status", {
      description: "Show current TDD workflow status",
      handler: async (_args, ctx) => {
        const { engineState, context, definition } = engine.getStatus();

        if (engineState === "idle") {
          ctx.ui.notify("No TDD workflow running. Start one with /tdd <objective>", "info");
          return;
        }

        const phase = context.currentPhase
          ? definition.phases.find((p) => p.id === context.currentPhase)
          : null;

        const completedPhases = Object.keys(context.phases).length;
        const lines = [
          `TDD Workflow: ${engineState}`,
          `Objective: ${context.input}`,
          `Progress: ${completedPhases}/${definition.phases.length} phases`,
          phase ? `Current: ${phase.label}` : "Current: (none)",
        ];

        ctx.ui.notify(lines.join("\n"), "info");
      },
    });
  }
}

export default function tdd(pi: ExtensionAPI) {
  new TddExtension(pi).register();
}
