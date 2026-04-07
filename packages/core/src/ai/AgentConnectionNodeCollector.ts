import type { CredentialRequirement } from "../contracts/credentialTypes";
import type { NodeConfigBase, NodeConnectionName, NodeId } from "../types";
import { ConnectionNodeIdFactory } from "../workflow/definition/ConnectionNodeIdFactory";
import { AgentConfigInspector } from "./AgentConfigInspectorFactory";
import type { AgentNodeConfig, ToolConfig } from "./AiHost";
import { NodeBackedToolConfig } from "./NodeBackedToolConfig";

export type AgentConnectionNodeRole = "languageModel" | "tool" | "nestedAgent";

export type AgentConnectionCredentialSource = Readonly<{
  getCredentialRequirements?(): ReadonlyArray<CredentialRequirement>;
}>;

export type AgentConnectionNodeDescriptor = Readonly<{
  nodeId: NodeId;
  parentNodeId: NodeId;
  connectionName: NodeConnectionName;
  role: AgentConnectionNodeRole;
  name: string;
  typeName: string;
  icon?: string;
  credentialSource: AgentConnectionCredentialSource;
}>;

type AgentConnectionNodeCollectorApi = Readonly<{
  collect(parentNodeId: NodeId, agentConfig: AgentNodeConfig<any, any>): ReadonlyArray<AgentConnectionNodeDescriptor>;
}>;

export const AgentConnectionNodeCollector: AgentConnectionNodeCollectorApi = new (class {
  collect(parentNodeId: NodeId, agentConfig: AgentNodeConfig<any, any>): ReadonlyArray<AgentConnectionNodeDescriptor> {
    const collected: AgentConnectionNodeDescriptor[] = [];
    this.collectInto(parentNodeId, agentConfig, collected);
    return collected;
  }

  private collectInto(
    parentNodeId: NodeId,
    agentConfig: AgentNodeConfig<any, any>,
    collected: AgentConnectionNodeDescriptor[],
  ): void {
    collected.push({
      nodeId: ConnectionNodeIdFactory.languageModelConnectionNodeId(parentNodeId),
      parentNodeId,
      connectionName: "llm",
      role: "languageModel",
      name: agentConfig.chatModel.presentation?.label ?? agentConfig.chatModel.name,
      typeName: agentConfig.chatModel.name,
      icon: agentConfig.chatModel.presentation?.icon,
      credentialSource: agentConfig.chatModel,
    });

    for (const tool of agentConfig.tools ?? []) {
      const toolNodeId = ConnectionNodeIdFactory.toolConnectionNodeId(parentNodeId, tool.name);
      const isNestedAgent = this.isNodeBackedAgentTool(tool);
      collected.push({
        nodeId: toolNodeId,
        parentNodeId,
        connectionName: "tools",
        role: isNestedAgent ? "nestedAgent" : "tool",
        name: tool.presentation?.label ?? tool.name,
        typeName: tool.name,
        icon: tool.presentation?.icon,
        credentialSource: tool,
      });
      this.collectNestedAgentTools(toolNodeId, tool, collected);
    }
  }

  private collectNestedAgentTools(
    toolNodeId: NodeId,
    tool: ToolConfig,
    collected: AgentConnectionNodeDescriptor[],
  ): void {
    if (!this.isNodeBackedAgentTool(tool)) {
      return;
    }
    const innerAgent =
      tool instanceof NodeBackedToolConfig ? tool.node : (tool as unknown as { node: AgentNodeConfig<any, any> }).node;
    this.collectInto(toolNodeId, innerAgent, collected);
  }

  /**
   * After JSON round-trip (persisted snapshots), tools are plain objects — `instanceof NodeBackedToolConfig` fails.
   * Detect node-backed tools structurally via {@link NodeBackedToolConfig#toolKind}.
   */
  private isNodeBackedAgentTool(tool: ToolConfig): boolean {
    if (tool instanceof NodeBackedToolConfig) {
      return AgentConfigInspector.isAgentNodeConfig(tool.node);
    }
    if (!tool || typeof tool !== "object") {
      return false;
    }
    const t = tool as unknown as Record<string, unknown>;
    if (t.toolKind !== "nodeBacked") {
      return false;
    }
    return AgentConfigInspector.isAgentNodeConfig(t.node as NodeConfigBase);
  }
})();
