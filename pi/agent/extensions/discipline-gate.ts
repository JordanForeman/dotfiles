import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import path from "node:path";
import { GuardianExtensionCore } from "../extension-core/guardian-extension-core";

/**
 * discipline-gate
 *
 * A "council of reviewers" guardian (inspired by bash-guard) that ENFORCES the
 * ambient engineering discipline that was extracted into skills on 2026-06-16.
 * Ambient guidance is "the model was told"; this gate is "the model was stopped."
 *
 * Enforcement levels (Jordan, 2026-06-16):
 *   - search-before-write  → CONFIRM  (block edit/write w/o prior read/search)
 *   - careful-actions      → CONFIRM  (block destructive bash)
 *   - validation-discovery → WARN     (non-blocking nudge after writes)
 *   - worktree             → omitted  (deliberately not enforced for now)
 *
 * Quality reviewer (task-completion gate):
 *   - request_review custom tool: agent calls it when it suspects it has
 *     satisfied the user's request. Records the signal and directs dispatch to
 *     the `reviewer` subagent. Commit-like bash WARNs if review was skipped.
 */

const WRITE_TOOLS = new Set(["edit", "write"]);

// Destructive bash patterns → CONFIRM (careful-actions).
const DESTRUCTIVE_BASH: { re: RegExp; reason: string }[] = [
  { re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, reason: "recursive force delete (rm -rf)" },
  { re: /\bgit\s+push\b[^\n]*\s(--force\b|-f\b)/i, reason: "git force-push" },
  { re: /\bgit\s+push\b[^\n]*--force-with-lease/i, reason: "git force-push (with-lease)" },
  { re: /\bgit\s+reset\s+--hard\b/i, reason: "git reset --hard (discards changes)" },
  { re: /\bgit\s+clean\s+-[a-z]*f/i, reason: "git clean -f (deletes untracked files)" },
  { re: /\bgit\s+(checkout|switch)\b[^\n]*\s(--force\b|-f\b)/i, reason: "force checkout (discards changes)" },
  { re: /\bgit\s+branch\s+-D\b/i, reason: "force branch delete" },
  { re: /--no-verify\b/i, reason: "bypassing git hooks (--no-verify)" },
  { re: /\bdrop\s+(table|database)\b/i, reason: "SQL DROP TABLE/DATABASE" },
  { re: /\bsudo\s+rm\b/i, reason: "sudo rm" },
  { re: /\bchmod\s+-R\b/i, reason: "recursive chmod" },
  { re: />\s*\/dev\/sd[a-z]/i, reason: "raw device write" },
];

// Commit-like bash → WARN if no review happened in this task window.
const COMMIT_BASH = /\b(git\s+commit|gt\s+(submit|create|modify))\b/i;

// Signals that the agent has discovered/run a validation contract this window.
const VALIDATION_SIGNAL = /\b(test|tests|rspec|jest|vitest|pytest|go\s+test|cargo\s+test|tc\b|typecheck|tsc\b|lint|rubocop|eslint|make\s+(test|check|lint|ci)|dev\s+(test|tc|check))\b/i;

type ToolCallEntry = { toolName: string; input: unknown };

/** Pull a usable string of "what command/path was touched" from any entry. */
function entryToText(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  return [o.command, o.path, o.query, o.pattern]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

export class DisciplineGateExtension extends GuardianExtensionCore {
  // Per-session task window. Reset whenever a review is requested or a commit lands.
  private reviewRequested = false;
  private validationSeenThisWindow = false;
  private writesThisWindow = 0;

  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "discipline-gate",
      name: "Discipline Gate",
      summary: "Council-of-reviewers enforcement for ambient engineering discipline",
    });
  }

  protected registerExtension(): void {
    this.registerWriteGate();
    this.registerReviewTool();
    this.observeResults();
  }

  // ── Ledger: reconstruct prior reads/searches from the session ──────────────

  private collectToolCalls(ctx: ExtensionContext): ToolCallEntry[] {
    const calls: ToolCallEntry[] = [];
    let entries: unknown[] = [];
    try {
      entries = ctx.sessionManager?.getEntries?.() ?? [];
    } catch {
      return calls;
    }
    for (const entry of entries) {
      const msg = (entry as { message?: { role?: string; content?: unknown; toolName?: string; command?: string } })?.message;
      if (!msg) continue;
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        for (const c of msg.content as Array<Record<string, unknown>>) {
          if (c?.type === "toolCall" && typeof c.toolName === "string") {
            calls.push({ toolName: c.toolName, input: (c as { input?: unknown }).input });
          }
        }
      } else if (msg.role === "toolResult" && typeof msg.toolName === "string") {
        calls.push({ toolName: msg.toolName, input: undefined });
      } else if (msg.role === "bashExecution" && typeof msg.command === "string") {
        calls.push({ toolName: "bash", input: { command: msg.command } });
      }
    }
    return calls;
  }

  /** Has the target path been read or searched earlier in this session? */
  private targetWasInspected(ctx: ExtensionContext, targetPath: string): boolean {
    const base = path.basename(targetPath);
    const calls = this.collectToolCalls(ctx);
    for (const call of calls) {
      const text = entryToText(call.input);
      if (call.toolName === "read" && text.includes(targetPath)) return true;
      // search tools (grep/find/ls) or bash that references the file or its dir
      if (["grep", "find", "ls", "rg"].includes(call.toolName) && (text.includes(targetPath) || text.includes(base))) {
        return true;
      }
      if (call.toolName === "bash" && (text.includes(targetPath) || text.includes(base))) return true;
      if (call.toolName === "read" && text.includes(base)) return true;
    }
    return false;
  }

  private sawValidation(ctx: ExtensionContext): boolean {
    if (this.validationSeenThisWindow) return true;
    for (const call of this.collectToolCalls(ctx)) {
      if (call.toolName === "bash" && VALIDATION_SIGNAL.test(entryToText(call.input))) return true;
    }
    return false;
  }

  // ── Gate 1+2: write-capable tool_call interception ─────────────────────────

  private registerWriteGate(): void {
    this.pi.on("tool_call", async (event, ctx) => {
      if (!ctx.hasUI) return; // can't prompt; let it pass rather than hard-fail headless

      // CONFIRM: search-before-write (edit/write to an un-inspected file).
      // Both `edit` and `write` expose `path` as their target; read it directly
      // rather than narrowing on a dynamic tool name.
      if (WRITE_TOOLS.has(event.toolName)) {
        const targetPath = (event.input as { path?: string })?.path;
        if (targetPath && !this.targetWasInspected(ctx, targetPath)) {
          const proceed = await ctx.ui.confirm(
            "⚖️  search-before-write",
            `No prior read/search of ${path.basename(targetPath)} this session. ` +
              `Discipline says: prove what exists before editing. Proceed anyway?`
          );
          if (!proceed) {
            return { block: true, reason: `Blocked: read/search ${targetPath} before writing (search-before-write).` };
          }
        }
        this.writesThisWindow += 1;
        // WARN: validation-discovery nudge after first few writes with no validation seen.
        if (this.writesThisWindow === 1 && !this.sawValidation(ctx)) {
          ctx.ui.notify(
            "validation-discovery: no validation contract exercised yet this task. Discover & run the project's checks (AGENTS.md → task runner → CI → language defaults) before declaring done.",
            "warning"
          );
        }
        return;
      }

      if (isToolCallEventType("bash", event)) {
        const command = event.input.command ?? "";

        // CONFIRM: careful-actions (destructive bash)
        for (const { re, reason } of DESTRUCTIVE_BASH) {
          if (re.test(command)) {
            const proceed = await ctx.ui.confirm(
              "⚖️  careful-actions",
              `Destructive/irreversible action detected: ${reason}.\n\n${command.slice(0, 200)}\n\nProceed?`
            );
            if (!proceed) {
              return { block: true, reason: `Blocked: ${reason} (careful-actions). Investigate root cause instead of bypassing.` };
            }
            break;
          }
        }

        // WARN: commit without a quality review this window.
        if (COMMIT_BASH.test(command) && !this.reviewRequested) {
          ctx.ui.notify(
            "Committing without a quality review. If you believe the task is complete, call `request_review` first to dispatch the reviewer subagent.",
            "warning"
          );
        }
        if (COMMIT_BASH.test(command)) this.resetWindow();
      }
    });
  }

  // ── Gate 3: quality reviewer trigger (agent-driven) ────────────────────────

  private registerReviewTool(): void {
    const self = this;
    this.pi.registerTool({
      name: "request_review",
      label: "Request Quality Review",
      description:
        "Call this when you believe you have satisfied the user's original request " +
        "(or finished a Ralph subtask). Records the completion signal and instructs " +
        "you to dispatch the `reviewer` subagent over your changes before declaring done.",
      parameters: Type.Object({
        summary: Type.String({ description: "1-3 sentences: what you implemented and why you think it satisfies the request." }),
        changed_files: Type.Optional(Type.Array(Type.String(), { description: "Paths you changed, for the reviewer to focus on." })),
      }),
      async execute(_toolCallId, params) {
        self.reviewRequested = true;
        const files = (params.changed_files ?? []).filter((f) => typeof f === "string");
        const fileList = files.length ? files.join(", ") : "(enumerate via `git diff --name-only` / `git status`)";
        const directive =
          `Quality-review gate engaged.\n\n` +
          `You signalled the task is complete:\n  ${params.summary}\n\n` +
          `Before declaring done, dispatch the generalized reviewer over the changes ` +
          `using the subagent tool:\n\n` +
          `  subagent({ agent: "reviewer", task: "Review these changes for correctness, ` +
          `safety, security, and quality. Files: ${fileList}. Original request context: ` +
          `${params.summary} Give a go/no-go verdict with file-specific evidence; ` +
          `distinguish blockers from nits." })\n\n` +
          `Then act on blockers before committing. A commit without a prior review will warn.`;
        return { content: [{ type: "text" as const, text: directive }], details: { reviewRequested: true, files } };
      },
    });
  }

  // ── Track validation runs + reset window after commits ─────────────────────

  private observeResults(): void {
    this.pi.on("tool_result", async (event) => {
      if (event.toolName === "bash") {
        const text = (event as { details?: { command?: string } }).details?.command ?? "";
        if (VALIDATION_SIGNAL.test(text)) this.validationSeenThisWindow = true;
      }
    });
  }

  private resetWindow(): void {
    this.reviewRequested = false;
    this.validationSeenThisWindow = false;
    this.writesThisWindow = 0;
  }
}

export default function disciplineGate(pi: ExtensionAPI): void {
  new DisciplineGateExtension(pi).register();
}
