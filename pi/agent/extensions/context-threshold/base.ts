/**
 * Inline base class for extensions managed by Home Manager.
 *
 * Home Manager's `recursive = true` creates per-file symlinks whose real paths
 * land in isolated Nix store hashes. Relative imports like `../../extension-core/`
 * resolve from the real path and break. This file inlines the minimal base class
 * hierarchy so the extension is self-contained.
 *
 * If extension-core changes, update this file to match.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type ExtensionCategory = "guardian" | "interceptor" | "workflow" | "widget" | "integration";

type ExtensionIdentity = {
  id: string;
  name: string;
  category: ExtensionCategory;
  summary?: string;
};

abstract class ExtensionCore {
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

  protected ensureUi(
    ctx: ExtensionContext | ExtensionCommandContext,
    _message = `${this.name} requires interactive UI mode.`,
  ): boolean {
    return ctx.hasUI;
  }
}

export abstract class InterceptorExtensionCore extends ExtensionCore {
  protected constructor(
    pi: ExtensionAPI,
    identity: Omit<ExtensionIdentity, "category">,
  ) {
    super(pi, { ...identity, category: "interceptor" });
  }
}
