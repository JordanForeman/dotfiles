import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ExtensionCore } from "./extension-core";

export abstract class WorkflowExtensionCore extends ExtensionCore {
  protected constructor(pi: ExtensionAPI, identity: Omit<ConstructorParameters<typeof ExtensionCore>[1], "category">) {
    super(pi, { ...identity, category: "workflow" });
  }
}
