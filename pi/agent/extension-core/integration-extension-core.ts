import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ExtensionCore } from "./extension-core";

export abstract class IntegrationExtensionCore extends ExtensionCore {
  protected constructor(pi: ExtensionAPI, identity: Omit<ConstructorParameters<typeof ExtensionCore>[1], "category">) {
    super(pi, { ...identity, category: "integration" });
  }
}
