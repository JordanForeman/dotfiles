import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { WorkflowEngine, type WorkflowDefinition } from "../../extension-core/workflow-engine";
import { WorkflowExtensionCore } from "../../extension-core/workflow-extension-core";

const MAX_INVESTIGATION_ROUNDS = 3;

const TRIAGE_WORKFLOW: WorkflowDefinition = {
  id: "triage",
  name: "Incident Triage",
  description: "Parallel investigation with convergent synthesis",
  phases: [
    {
      id: "investigate",
      label: "🔍 Parallel investigation",
      execution: "parallel",
      tasks: [
        {
          agent: "code-explorer",
          task: [
            "Investigate source code related to: {input}",
            "",
            "Focus on:",
            "- Relevant code paths and entry points",
            "- Recent changes that could explain the issue",
            "- Error handling and edge cases in the affected area",
          ].join("\n"),
        },
        {
          agent: "log-viewer",
          task: [
            "Search for observability signals related to: {input}",
            "",
            "Focus on:",
            "- Error logs and stack traces",
            "- Request traces showing the failure path",
            "- Metrics anomalies around the time of the incident",
          ].join("\n"),
        },
      ],
      transition: { type: "advance" },
    },
    {
      id: "synthesize",
      label: "📋 Synthesize findings",
      execution: "sequential",
      tasks: [{
        agent: "architect",
        task: [
          "Synthesize all investigation findings into a triage report.",
          "",
          "Produce:",
          "1. **Root cause analysis** — what is most likely causing the issue",
          "2. **Confidence level** — high/medium/low with reasoning",
          "3. **Evidence summary** — key findings from each investigation track",
          "4. **Recommended next steps** — ordered by impact and urgency",
          "",
          "If your confidence is LOW and critical information gaps remain,",
          "end your response with the exact line:",
          "NEEDS_FURTHER_INVESTIGATION: <what to look for>",
          "",
          "Investigation findings:",
          "{context}",
        ].join("\n"),
      }],
      transition: {
        type: "conditional",
        decide: (result, context) => {
          const output = result.outputs[0];
          const needsMore = [output?.result, output?.receipt.verdict]
            .filter(Boolean)
            .some((text) => text?.includes("NEEDS_FURTHER_INVESTIGATION"));
          const round = (context.state.investigationRound as number ?? 0) + 1;

          if (needsMore && round < MAX_INVESTIGATION_ROUNDS) {
            context.state.investigationRound = round;
            return "investigate";
          }

          return null; // workflow complete
        },
      },
    },
  ],
};

class TriageExtension extends WorkflowExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "triage",
      name: "Triage Workflow",
      summary: "Parallel investigation with convergent synthesis",
    });
  }

  protected registerExtension(): void {
    const engine = new WorkflowEngine(this.pi, TRIAGE_WORKFLOW);

    this.pi.registerCommand("triage", {
      description: "Start an incident triage: parallel investigation → synthesis → (re-investigate if needed)",
      handler: async (args, ctx) => {
        const input = args.trim();
        if (!input) {
          ctx.ui.notify("Usage: /triage <describe the issue or incident>", "error");
          return;
        }

        if (engine.isActive()) {
          ctx.ui.notify("A triage workflow is already running.", "warning");
          return;
        }

        engine.start(input, ctx);
      },
    });

    this.pi.registerCommand("triage:status", {
      description: "Show current triage workflow status",
      handler: async (_args, ctx) => {
        const { engineState, context, definition } = engine.getStatus();

        if (engineState === "idle") {
          ctx.ui.notify("No triage running. Start one with /triage <issue description>", "info");
          return;
        }

        const phase = context.currentPhase
          ? definition.phases.find((p) => p.id === context.currentPhase)
          : null;

        const round = (context.state.investigationRound as number ?? 0) + 1;
        const lines = [
          `Triage Workflow: ${engineState}`,
          `Issue: ${context.input}`,
          `Investigation round: ${round}`,
          phase ? `Current: ${phase.label}` : "Current: (none)",
        ];

        ctx.ui.notify(lines.join("\n"), "info");
      },
    });
  }
}

export default function triage(pi: ExtensionAPI) {
  new TriageExtension(pi).register();
}
