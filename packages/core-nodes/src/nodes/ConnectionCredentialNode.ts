import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { node } from "@codemation/core";

import type { ConnectionCredentialNodeConfig } from "./ConnectionCredentialNodeConfig";

/**
 * Placeholder runnable node for connection-owned workflow nodes (LLM/tool slots).
 * The engine does not schedule these; they exist for credentials, tokens, and UI identity.
 */
@node({ packageName: "@codemation/core-nodes" })
export class ConnectionCredentialNode implements RunnableNode<ConnectionCredentialNodeConfig> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  execute(_args: RunnableNodeExecuteArgs<ConnectionCredentialNodeConfig>): unknown {
    return [];
  }
}
