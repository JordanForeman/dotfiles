import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

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
  "orchestrat",
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

function isDelegationTool(toolName: string): boolean {
  return toolName === "subagent" || toolName === "subagent_list";
}

export default function runtimeReminders(pi: ExtensionAPI) {
  let turnCount = 0;
  let delegatedThisTurn = false;
  let turnsWithoutDelegation = 0;

  let pendingPermissionReminder = false;
  let pendingEditDriftReminder = false;

  let lastDelegationReminderTurn = -100;
  let lastContextReminderTurn = -100;

  pi.on("turn_start", async () => {
    delegatedThisTurn = false;
  });

  pi.on("tool_call", async (event) => {
    if (isDelegationTool(event.toolName)) {
      delegatedThisTurn = true;
    }
  });

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
    turnsWithoutDelegation = delegatedThisTurn ? 0 : turnsWithoutDelegation + 1;
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

    if (
      turnsWithoutDelegation >= 3 &&
      isComplexPrompt(event.prompt) &&
      turnCount - lastDelegationReminderTurn >= 3
    ) {
      reminders.push(
        "This looks like complex, multi-step work. Consider using subagent_list and subagent delegation for deeper exploration or parallelized analysis."
      );
      lastDelegationReminderTurn = turnCount;
    }

    const usage = ctx.getContextUsage();
    if (usage && usage.percent >= 85 && turnCount - lastContextReminderTurn >= 2) {
      reminders.push(
        `Context usage is high (${usage.percent.toFixed(1)}%). Keep responses focused and consider compaction if context pressure increases.`
      );
      lastContextReminderTurn = turnCount;
    }

    if (reminders.length === 0) return;

    const reminderText = [
      "## Runtime reminders",
      ...reminders.map((line) => `- ${line}`),
    ].join("\n");

    return {
      systemPrompt: `${event.systemPrompt}\n\n${reminderText}`,
    };
  });
}
