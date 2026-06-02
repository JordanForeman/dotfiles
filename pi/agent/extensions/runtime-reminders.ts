import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { InterceptorExtensionCore } from "../extension-core/interceptor-extension-core";

const COMPLEX_PROMPT_KEYWORDS = [
  "implement",
  "investigate",
  "refactor",
  "migrate",
  "design",
  "architecture",
  "plan",
  "workflow",
  "multi-step",
  "build",
  "create",
  "ship",
  "spin up",
  "marketing site",
  "landing page",
];

function extractToolResultText(event: any): string {
  if (!Array.isArray(event.content)) return "";

  return event.content
    .filter((item: any) => item?.type === "text" && typeof item.text === "string")
    .map((item: any) => item.text)
    .join("\n")
    .toLowerCase();
}

function looksLikePermissionDenial(text: string): boolean {
  return /(permission|denied|not allowed|approval|blocked by user|cancelled by user)/i.test(text);
}

function looksLikeEditDrift(text: string): boolean {
  return /(old_string|old text|not found|not unique|failed to match exact)/i.test(text);
}

function isComplexPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (lower.length > 180) return true;
  return COMPLEX_PROMPT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function hasDesignIntent(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const signals = [
    "design",
    "visual",
    "aesthetic",
    "ui",
    "ux",
    "brand",
    "typography",
    "color palette",
    "theme",
    "motion",
    "animation",
    "marketing site",
    "landing page",
    "hero section",
    "microsite",
  ];

  return signals.some((signal) => lower.includes(signal));
}

function looksLikeExecutionObjective(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const executionSignals = ["implement", "build", "create", "ship", "spin up", "deliver", "set up"];
  return executionSignals.some((signal) => lower.includes(signal));
}

function requestsParallelExecution(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes("/parallel") ||
    lower.includes("parallel") ||
    lower.includes("team") ||
    lower.includes("split") ||
    lower.includes("multiple tracks")
  );
}

function shouldDefaultToDelegation(prompt: string): boolean {
  return looksLikeExecutionObjective(prompt) || isComplexPrompt(prompt);
}

function registerRuntimeReminders(pi: ExtensionAPI) {
  let turnCount = 0;

  let pendingPermissionReminder = false;
  let pendingEditDriftReminder = false;

  let lastDelegationReminderTurn = -100;
  let lastContextReminderTurn = -100;

  pi.on("tool_result", async (event) => {
    if (!event.isError) return;

    const text = extractToolResultText(event);
    if (!text) return;

    if (looksLikePermissionDenial(text)) {
      pendingPermissionReminder = true;
    }

    if (event.toolName === "edit" && looksLikeEditDrift(text)) {
      pendingEditDriftReminder = true;
    }
  });

  pi.on("turn_end", async () => {
    turnCount += 1;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const reminders: string[] = [];

    if (pendingPermissionReminder) {
      reminders.push(
        "A recent tool call appears to have been denied. Do not retry the exact same call; adapt your approach or ask the user for clarification."
      );
      pendingPermissionReminder = false;
    }

    if (pendingEditDriftReminder) {
      reminders.push(
        "A recent edit likely failed due to stale context. Re-read the target file/section before attempting another edit."
      );
      pendingEditDriftReminder = false;
    }

    if (shouldDefaultToDelegation(event.prompt) && turnCount - lastDelegationReminderTurn >= 1) {
      reminders.push(
        "Standard operating procedure: start with a brief plan, then execute via `subagent` using the smallest viable mode (single, chain, or parallel)."
      );
      reminders.push(
        "Avoid over-coordination. Pick one specialist first, then expand to chain/parallel only when decomposition is clearly beneficial."
      );
      lastDelegationReminderTurn = turnCount;
    }

    if (requestsParallelExecution(event.prompt)) {
      reminders.push(
        "Parallel intent detected. Prefer `/parallel` (or a chain with parallel steps), and split tasks so file ownership is conflict-safe."
      );
    }

    if (hasDesignIntent(event.prompt)) {
      reminders.push(
        "Design intent detected. Include a dedicated design-focused agent when useful and carry its output into implementation steps."
      );
    }

    const usage = ctx.getContextUsage();
    if (usage && usage.percent >= 85 && turnCount - lastContextReminderTurn >= 2) {
      reminders.push(
        `Context usage is high (${usage.percent.toFixed(1)}%). Keep responses focused and consider compaction if context pressure increases.`
      );
      lastContextReminderTurn = turnCount;
    }

    if (reminders.length === 0) return;

    const reminderText = ["## Runtime reminders", ...reminders.map((line) => `- ${line}`)].join("\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${reminderText}`,
    };
  });
}

class RuntimeRemindersExtension extends InterceptorExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "runtime-reminders",
      name: "Runtime Reminders",
      summary: "Silent runtime behavior reminders",
    });
  }

  protected registerExtension(): void {
    registerRuntimeReminders(this.pi);
  }
}

export default function runtimeReminders(pi: ExtensionAPI) {
  new RuntimeRemindersExtension(pi).register();
}
