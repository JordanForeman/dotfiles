import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { WidgetExtensionCore } from "../extension-core/widget-extension-core";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

const THEME_SUBCOMMANDS = ["list", "current", "next", "prev", "pick", "set-default", "help"];

function getThemeNames(ctx: ExtensionCommandContext): string[] {
  return [...new Set(ctx.ui.getAllThemes().map((theme) => theme.name))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function resolveTheme(themes: string[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return themes.find((theme) => theme.toLowerCase() === lower);
}

function switchTheme(
  ctx: ExtensionCommandContext,
  themeName: string,
  options: { notifySuccess?: boolean; notifyError?: boolean } = {}
): boolean {
  const { notifySuccess = true, notifyError = true } = options;
  const result = ctx.ui.setTheme(themeName);
  if (!result.success) {
    if (notifyError) {
      ctx.ui.notify(`Failed to switch theme to "${themeName}": ${result.error}`, "error");
    }
    return false;
  }

  if (notifySuccess) {
    ctx.ui.notify(`Switched theme to "${themeName}"`, "info");
  }

  return true;
}

function getAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  if (!configured) return path.join(os.homedir(), ".pi", "agent");
  if (configured === "~") return os.homedir();
  if (configured.startsWith("~/")) return path.join(os.homedir(), configured.slice(2));
  return configured;
}

async function setDefaultTheme(themeName: string): Promise<string> {
  const settingsPath = path.join(getAgentDir(), "settings.json");

  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code !== "ENOENT") throw error;
  }

  settings.theme = themeName;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

  return settingsPath;
}

async function showThemeModal(ctx: ExtensionCommandContext, themes: string[]): Promise<string | null> {
  const items: SelectItem[] = themes.map((name) => ({ value: name, label: name }));
  const originalTheme = ctx.ui.theme.name;

  return ctx.ui.custom<string | null>(
    (tui, theme, _kb, done) => {
      const container = new Container();
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold("Theme Switcher")), 1, 0));

      const selectList = new SelectList(items, Math.min(items.length, 12), {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      });

      const startIndex = originalTheme ? themes.findIndex((name) => name === originalTheme) : -1;
      if (startIndex >= 0) {
        selectList.setSelectedIndex(startIndex);
      }

      selectList.onSelectionChange = (item) => {
        switchTheme(ctx, item.value, { notifySuccess: false, notifyError: false });
      };
      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(null);

      container.addChild(selectList);
      container.addChild(
        new Text(theme.fg("dim", "↑↓/search to preview • enter confirm • esc cancel"), 1, 0)
      );
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

      return {
        render(width: number) {
          return container.render(width);
        },
        invalidate() {
          container.invalidate();
        },
        handleInput(data: string) {
          selectList.handleInput(data);
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "60%",
        minWidth: 56,
        maxHeight: "80%",
        margin: 1,
      },
    }
  );
}

function usage(): string {
  return [
    "Usage:",
    "  /theme                    # open modal picker (live preview)",
    "  /theme <name>             # set exact theme",
    "  /theme next|prev          # cycle themes",
    "  /theme list               # show available themes",
    "  /theme current            # show active theme",
    "  /theme set-default [name] # persist default theme",
  ].join("\n");
}

function registerThemeSwitcher(pi: ExtensionAPI) {
  pi.registerCommand("theme", {
    description: "Switch Pi themes at runtime",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const trimmed = prefix.trimStart().toLowerCase();
      const items = THEME_SUBCOMMANDS.filter((value) => value.startsWith(trimmed)).map((value) => ({
        value,
        label: value,
      }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const themes = getThemeNames(ctx);
      if (themes.length === 0) {
        ctx.ui.notify("No themes are available.", "warning");
        return;
      }

      const currentTheme = ctx.ui.theme.name;
      const input = (args ?? "").trim();
      const [firstToken, ...restTokens] = input.split(/\s+/);
      const command = firstToken?.toLowerCase() ?? "";

      if (!input || command === "pick") {
        const originalTheme = currentTheme;
        const picked = await showThemeModal(ctx, themes);

        if (!picked) {
          if (originalTheme && ctx.ui.theme.name !== originalTheme) {
            switchTheme(ctx, originalTheme, { notifySuccess: false, notifyError: false });
          }
          return;
        }

        if (ctx.ui.theme.name === picked) {
          ctx.ui.notify(`Switched theme to "${picked}"`, "info");
          return;
        }

        switchTheme(ctx, picked);
        return;
      }

      if (command === "list") {
        ctx.ui.notify(`Available themes: ${themes.join(", ")}`, "info");
        return;
      }

      if (command === "current") {
        ctx.ui.notify(`Current theme: ${currentTheme ?? "unknown"}`, "info");
        return;
      }

      if (command === "next" || command === "prev") {
        const currentIndex = currentTheme ? themes.findIndex((name) => name === currentTheme) : -1;
        const offset = command === "next" ? 1 : -1;
        const startIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (startIndex + offset + themes.length) % themes.length;
        switchTheme(ctx, themes[nextIndex]);
        return;
      }

      if (command === "help") {
        ctx.ui.notify(usage(), "info");
        return;
      }

      if (command === "set-default") {
        const requested = restTokens.join(" ").trim();
        const selectedTheme = requested || currentTheme;

        if (!selectedTheme) {
          ctx.ui.notify(
            "No theme provided and current theme is unknown. Use /theme set-default <name>.",
            "warning"
          );
          return;
        }

        const resolved = resolveTheme(themes, selectedTheme);
        if (!resolved) {
          ctx.ui.notify(`Unknown theme: "${selectedTheme}"\n\n${usage()}`, "warning");
          return;
        }

        try {
          const settingsPath = await setDefaultTheme(resolved);
          ctx.ui.notify(`Set default theme to "${resolved}" in ${settingsPath}`, "info");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Failed to update settings.json: ${message}`, "error");
        }

        return;
      }

      const exactMatch = resolveTheme(themes, input);
      if (!exactMatch) {
        ctx.ui.notify(`Unknown theme: "${input}"\n\n${usage()}`, "warning");
        return;
      }

      switchTheme(ctx, exactMatch);
    },
  });
}

class ThemeSwitcherExtension extends WidgetExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "theme-switcher",
      name: "Theme Switcher",
      summary: "Runtime theme widget and controls",
    });
  }

  protected registerExtension(): void {
    registerThemeSwitcher(this.pi);
  }
}

export default function themeSwitcher(pi: ExtensionAPI) {
  new ThemeSwitcherExtension(pi).register();
}
