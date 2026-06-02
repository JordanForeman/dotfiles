import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

export type ExtensionHealth = "ready" | "idle" | "warning" | "error";

const HEALTH_ICON: Record<ExtensionHealth, string> = {
  ready: "✓",
  idle: "○",
  warning: "!",
  error: "✗",
};

export function buildStatusLabel(name: string, health: ExtensionHealth, detail?: string): string {
  const icon = HEALTH_ICON[health];
  return detail ? `${name} ${icon} ${detail}` : `${name} ${icon}`;
}

export function setExtensionStatus(
  ctx: ExtensionContext | ExtensionCommandContext,
  key: string,
  name: string,
  health: ExtensionHealth,
  detail?: string
): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(key, buildStatusLabel(name, health, detail));
}
