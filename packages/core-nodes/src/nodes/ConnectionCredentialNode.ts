import type { Items, Node, NodeExecutionContext, NodeOutputs } from "@codemation/core";
import { node } from "@codemation/core";

import type { ConnectionCredentialNodeConfig } from "./ConnectionCredentialNodeConfig";

/**
 * Placeholder runnable node for connection-owned workflow nodes (LLM/tool slots).
 * The engine does not schedule these; they exist for credentials, tokens, and UI identity.
 */
@node({ packageName: "@codemation/core-nodes" })
export class ConnectionCredentialNode implements Node<ConnectionCredentialNodeConfig> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(_items: Items, _ctx: NodeExecutionContext<ConnectionCredentialNodeConfig>): Promise<NodeOutputs> {
    return { main: [] };
  }
}
