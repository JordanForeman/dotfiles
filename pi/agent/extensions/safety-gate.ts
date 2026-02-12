import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

// Minimal “guard rails” extension.
//
// Goals:
// - Confirm before obviously destructive shell commands
// - Protect common secret files / directories from accidental edits
//
// This is intentionally conservative and easy to extend.

function isDangerousBash(command: string): string | null {
  const cmd = command.trim();

  // High-signal patterns first.
  const patterns: Array<[RegExp, string]> = [
    [/\brm\b.*\s-rf\b/, "rm -rf"],
    [/\brm\b.*\s-r\b/, "rm -r"],
    [/\bsudo\b/, "sudo"],
    [/\bmkfs\b/, "mkfs"],
    [/\bdd\b/, "dd"],
    [/\bchmod\b\s+777\b/, "chmod 777"],
    [/\bchown\b.*\s+-R\b/, "chown -R"],
    [/\bgit\b\s+reset\b\s+--hard\b/, "git reset --hard"],
    [/\bgit\b\s+clean\b\s+-fd\b/, "git clean -fd"],
    [/\btruncate\b\s+-s\s+0\b/, "truncate to 0"],
    [/(?:^|\s)(?:>|>>|2>|&>)\s*\//, "redirect to absolute path"],
  ];

  for (const [re, label] of patterns) {
    if (re.test(cmd)) return label;
  }

  return null;
}

function isProtectedPath(path: string): { reason: string } | null {
  const p = path.replace(/^@/, "");

  // Common secret files
  if (/(^|\/)\.env(\.|$)/.test(p)) return { reason: "editing .env-like file" };
  if (/(^|\/)(id_rsa|id_ed25519)(\.|$)/.test(p)) return { reason: "editing SSH private key" };
  if (/\.(pem|key|p12|pfx)$/i.test(p)) return { reason: "editing key material" };

  // Common “shouldn’t edit” directories
  if (/(^|\/)node_modules\//.test(p)) return { reason: "writing under node_modules/" };
  if (/(^|\/)\.git\//.test(p)) return { reason: "writing under .git/" };

  return null;
}

export default function safetyGate(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // Guard bash
    if (isToolCallEventType("bash", event)) {
      const label = isDangerousBash(event.input.command);
      if (!label) return;

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked dangerous bash command in non-interactive mode (${label}).`,
        };
      }

      const ok = await ctx.ui.confirm(
        "Safety Gate",
        `Command looks dangerous (${label}).\n\nAllow this bash command?\n\n${event.input.command}`
      );

      if (!ok) return { block: true, reason: "Cancelled by user" };
      return;
    }

    // Guard writes/edits
    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const p = (event.input as any).path as string | undefined;
      if (!p) return;

      const protectedHit = isProtectedPath(p);
      if (!protectedHit) return;

      if (!ctx.hasUI) {
        return {
          block: true,
          reason: `Blocked ${event.toolName} to protected path (${protectedHit.reason}).`,
        };
      }

      const ok = await ctx.ui.confirm(
        "Safety Gate",
        `About to ${event.toolName} a protected path (${protectedHit.reason}).\n\nPath: ${p}\n\nAllow?`
      );
      if (!ok) return { block: true, reason: "Cancelled by user" };
    }
  });
}
