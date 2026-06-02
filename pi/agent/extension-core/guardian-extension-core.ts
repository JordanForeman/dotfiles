import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ExtensionCore } from "./extension-core";

export abstract class GuardianExtensionCore extends ExtensionCore {
  protected constructor(pi: ExtensionAPI, identity: Omit<ConstructorParameters<typeof ExtensionCore>[1], "category">) {
    super(pi, { ...identity, category: "guardian" });
  }
}
