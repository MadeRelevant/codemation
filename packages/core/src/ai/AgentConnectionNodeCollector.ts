import type { CredentialRequirement } from "../contracts/credentialTypes";
import type { McpServerDeclaration } from "../contracts/mcpTypes";
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

export type McpServerResolver = (id: string) => McpServerDeclaration | undefined;

type AgentConnectionNodeCollectorApi = Readonly<{
  collect(
    parentNodeId: NodeId,
    agentConfig: AgentNodeConfig<any, any>,
    mcpServerResolver?: McpServerResolver,
  ): ReadonlyArray<AgentConnectionNodeDescriptor>;
}>;

export const AgentConnectionNodeCollector: AgentConnectionNodeCollectorApi = new (class {
  collect(
    parentNodeId: NodeId,
    agentConfig: AgentNodeConfig<any, any>,
    mcpServerResolver?: McpServerResolver,
  ): ReadonlyArray<AgentConnectionNodeDescriptor> {
    const collected: AgentConnectionNodeDescriptor[] = [];
    this.collectInto(parentNodeId, agentConfig, collected, mcpServerResolver);
    return collected;
  }

  private collectInto(
    parentNodeId: NodeId,
    agentConfig: AgentNodeConfig<any, any>,
    collected: AgentConnectionNodeDescriptor[],
    mcpServerResolver?: McpServerResolver,
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
      this.collectNestedAgentTools(toolNodeId, tool, collected, mcpServerResolver);
    }

    if (mcpServerResolver) {
      const mcpServers = (agentConfig as unknown as { mcpServers?: ReadonlyArray<string> }).mcpServers;
      for (const serverId of mcpServers ?? []) {
        const decl = mcpServerResolver(serverId);
        if (!decl) {
          continue;
        }
        const acceptedTypes = decl.acceptedCredentialTypes ?? [];
        collected.push({
          nodeId: ConnectionNodeIdFactory.mcpConnectionNodeId(parentNodeId, serverId),
          parentNodeId,
          connectionName: "tools",
          role: "tool",
          name: decl.displayName,
          typeName: "MCP server",
          icon: "lucide:plug",
          credentialSource: {
            getCredentialRequirements: () => [
              {
                slotKey: "credential",
                label: decl.displayName,
                acceptedTypes,
              },
            ],
          },
        });
      }
    }
  }

  private collectNestedAgentTools(
    toolNodeId: NodeId,
    tool: ToolConfig,
    collected: AgentConnectionNodeDescriptor[],
    mcpServerResolver?: McpServerResolver,
  ): void {
    if (!this.isNodeBackedAgentTool(tool)) {
      return;
    }
    const innerAgent =
      tool instanceof NodeBackedToolConfig ? tool.node : (tool as unknown as { node: AgentNodeConfig<any, any> }).node;
    this.collectInto(toolNodeId, innerAgent, collected, mcpServerResolver);
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
