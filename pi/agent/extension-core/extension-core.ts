import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export type ExtensionCategory =
  | "guardian"
  | "interceptor"
  | "workflow"
  | "widget"
  | "integration";

export type ExtensionIdentity = {
  id: string;
  name: string;
  category: ExtensionCategory;
  summary?: string;
};

export abstract class ExtensionCore {
  protected readonly id: string;
  protected readonly name: string;
  protected readonly category: ExtensionCategory;
  protected readonly summary?: string;

  protected constructor(protected readonly pi: ExtensionAPI, identity: ExtensionIdentity) {
    this.id = identity.id;
    this.name = identity.name;
    this.category = identity.category;
    this.summary = identity.summary;
  }

  register(): void {
    this.registerExtension();
  }

  protected abstract registerExtension(): void;

  protected registerCommandAliases(
    baseName: string,
    description: string,
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
  ): void {
    for (const name of [baseName, baseName.replace(":", "-")]) {
      this.pi.registerCommand(name, { description, handler });
    }
  }

  protected ensureUi(
    ctx: ExtensionContext | ExtensionCommandContext,
    message = `${this.name} requires interactive UI mode.`
  ): boolean {
    if (ctx.hasUI) return true;
    return false;
  }

  protected appendSystemPromptBlock(eventSystemPrompt: string, heading: string, lines: string[]): string {
    const body = lines.join("\n");
    return `${eventSystemPrompt}\n\n## ${heading}\n${body}`;
  }
}
