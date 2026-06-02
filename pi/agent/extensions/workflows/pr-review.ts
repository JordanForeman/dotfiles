import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WorkflowEngine, type WorkflowDefinition } from "../../extension-core/workflow-engine";
import { WorkflowExtensionCore } from "../../extension-core/workflow-extension-core";

const PR_REVIEW_WORKFLOW: WorkflowDefinition = {
  id: "pr-review",
  name: "PR Review",
  description: "Triage-driven parallel review with convergent synthesis",
  phases: [
    {
      id: "triage",
      label: "🔍 Triage changes",
      execution: "sequential",
      tasks: [{
        agent: "pr-triage",
        task: [
          "Analyze the current changes and determine which review dimensions apply.",
          "",
          "Context: {input}",
          "",
          "1. Run `git diff --cached` (if empty, fall back to `git diff`)",
          "2. Produce your structured triage report identifying languages, change types,",
          "   architectural indicators, and recommended reviewers",
        ].join("\n"),
      }],
      transition: { type: "advance" },
    },
    {
      id: "review",
      label: "📋 Parallel review",
      execution: "parallel",
      tasks: [
        {
          agent: "design-reviewer",
          task: [
            "Review the current changes for architecture and design quality.",
            "",
            "Triage report (check if your review is applicable before proceeding):",
            "{phase:triage}",
          ].join("\n"),
        },
        {
          agent: "rails-reviewer",
          task: [
            "Review the current changes for Ruby/Rails conventions and quality.",
            "",
            "Triage report (check if your review is applicable before proceeding):",
            "{phase:triage}",
          ].join("\n"),
        },
        {
          agent: "frontend-reviewer",
          task: [
            "Review the current changes for frontend/React/TypeScript quality.",
            "",
            "Triage report (check if your review is applicable before proceeding):",
            "{phase:triage}",
          ].join("\n"),
        },
        {
          agent: "testing-reviewer",
          task: [
            "Review the current changes for test quality and coverage.",
            "",
            "Triage report (check if your review is applicable before proceeding):",
            "{phase:triage}",
          ].join("\n"),
        },
        {
          agent: "reviewer",
          task: [
            "Review the current changes for correctness, safety, and security.",
            "",
            "Pay special attention to:",
            "- Injection risks (SQL, command, template, path traversal)",
            "- Authentication and authorization bypasses",
            "- Unsafe secret handling or logging of sensitive data",
            "- Trust-boundary validation failures",
            "- Data loss or corruption risks",
            "",
            "Triage report (check for security-sensitive and general concerns):",
            "{phase:triage}",
          ].join("\n"),
        },
      ],
      transition: { type: "advance" },
    },
    {
      id: "synthesize",
      label: "📝 Synthesize review",
      execution: "sequential",
      tasks: [{
        agent: "reviewer",
        task: [
          "Synthesize all review findings into a single, actionable review report.",
          "",
          "Produce:",
          "1. **Summary verdict** — overall assessment of the changes",
          "2. **Blockers** — issues that must be resolved before merge (if any)",
          "3. **Non-blocking improvements** — suggestions ranked by impact",
          "4. **Security findings** — any security concerns surfaced during review",
          "5. **Go/no-go recommendation** with clear justification",
          "",
          "Deduplicate findings across reviewers. Attribute findings to the relevant",
          "reviewer when it adds context, but focus on a coherent unified report.",
          "",
          "Review findings:",
          "{context}",
        ].join("\n"),
      }],
      transition: { type: "advance" },
    },
  ],
};

class PrReviewExtension extends WorkflowExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "pr-review",
      name: "PR Review Workflow",
      summary: "Triage-driven parallel review with convergent synthesis",
    });
  }

  protected registerExtension(): void {
    const engine = new WorkflowEngine(this.pi, PR_REVIEW_WORKFLOW);

    this.pi.registerCommand("review", {
      description: "Start a PR review: triage → parallel specialist review → synthesis",
      handler: async (args, ctx) => {
        if (engine.isActive()) {
          ctx.ui.notify("A review workflow is already running.", "warning");
          return;
        }

        const input = args.trim() || "Review the current changes";
        engine.start(input, ctx);
      },
    });

    this.pi.registerCommand("review:status", {
      description: "Show current review workflow status",
      handler: async (_args, ctx) => {
        const { engineState, context, definition } = engine.getStatus();

        if (engineState === "idle") {
          ctx.ui.notify("No review running. Start one with /review", "info");
          return;
        }

        const phase = context.currentPhase
          ? definition.phases.find((p) => p.id === context.currentPhase)
          : null;

        const lines = [
          `PR Review Workflow: ${engineState}`,
          phase ? `Current: ${phase.label}` : "Current: (none)",
        ];

        ctx.ui.notify(lines.join("\n"), "info");
      },
    });
  }
}

export default function prReview(pi: ExtensionAPI) {
  new PrReviewExtension(pi).register();
}
