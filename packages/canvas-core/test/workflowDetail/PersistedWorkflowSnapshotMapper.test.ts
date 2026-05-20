import { describe, expect, it } from "vitest";
import { PersistedWorkflowSnapshotMapper } from "../../src/lib/workflowDetail/PersistedWorkflowSnapshotMapper";
import { ConnectionNodeIdFactory } from "@codemation/core/browser";
import type { PersistedWorkflowSnapshot } from "../../src/realtime/realtimeDomainTypes";

function makeMinimalAgentConfig(extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chatModel: { name: "gpt-4o", presentation: { label: "GPT-4o" } },
    messages: [],
    tools: [],
    ...extras,
  };
}

function makeSnapshot(
  nodeId: string,
  agentConfig: Record<string, unknown>,
  overrides: Partial<PersistedWorkflowSnapshot> = {},
): PersistedWorkflowSnapshot {
  return {
    id: "wf1",
    name: "Workflow",
    nodes: [
      {
        id: nodeId,
        kind: "node",
        name: "My Agent",
        nodeTokenId: "AIAgentNode",
        configTokenId: "AIAgentConfig",
        tokenName: "AIAgentNode",
        configTokenName: "AIAgentConfig",
        config: agentConfig,
      },
    ],
    edges: [],
    ...overrides,
  };
}

describe("PersistedWorkflowSnapshotMapper", () => {
  const mapper = new PersistedWorkflowSnapshotMapper();

  describe("MCP server attachment nodes", () => {
    it("emits an attachment node for each MCP server (shorthand array form)", () => {
      const agentConfig = makeMinimalAgentConfig({ mcpServers: ["gmail"] });
      const snapshot = makeSnapshot("agent1", agentConfig);

      const dto = mapper.map(snapshot);

      const mcpNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent1", "gmail");
      const mcpNode = dto.nodes.find((n) => n.id === mcpNodeId);
      expect(mcpNode).toBeDefined();
      expect(mcpNode?.role).toBe("tool");
      expect(mcpNode?.parentNodeId).toBe("agent1");
      expect(mcpNode?.type).toBe("gmail");
    });

    it("emits an attachment node for each MCP server (record/explicit form)", () => {
      const agentConfig = makeMinimalAgentConfig({
        mcpServers: { gmail: { credential: "cred-1" } },
      });
      const snapshot = makeSnapshot("agent1", agentConfig);

      const dto = mapper.map(snapshot);

      const mcpNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent1", "gmail");
      const mcpNode = dto.nodes.find((n) => n.id === mcpNodeId);
      expect(mcpNode).toBeDefined();
      expect(mcpNode?.role).toBe("tool");
      expect(mcpNode?.parentNodeId).toBe("agent1");
    });

    it("does not emit a duplicate MCP node when it is already materialized in snapshot.nodes", () => {
      const mcpNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent1", "gmail");
      const agentConfig = makeMinimalAgentConfig({ mcpServers: ["gmail"] });
      const snapshot: PersistedWorkflowSnapshot = {
        id: "wf1",
        name: "Workflow",
        nodes: [
          {
            id: "agent1",
            kind: "node",
            name: "My Agent",
            nodeTokenId: "AIAgentNode",
            configTokenId: "AIAgentConfig",
            config: agentConfig,
          },
          {
            id: mcpNodeId,
            kind: "node",
            name: "Gmail MCP",
            nodeTokenId: "ConnectionCredentialNode",
            configTokenId: "ConnectionCredentialNodeConfig",
            config: { name: "gmail" },
          },
        ],
        edges: [],
        connections: [
          {
            parentNodeId: "agent1",
            connectionName: "tools",
            childNodeIds: [mcpNodeId],
          },
        ],
      };

      const dto = mapper.map(snapshot);

      const mcpNodes = dto.nodes.filter((n) => n.id === mcpNodeId);
      expect(mcpNodes).toHaveLength(1);
    });

    it("emits a synthesized edge from agent to MCP attachment node", () => {
      const agentConfig = makeMinimalAgentConfig({ mcpServers: ["gmail"] });
      const snapshot = makeSnapshot("agent1", agentConfig);

      const dto = mapper.map(snapshot);

      const mcpNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent1", "gmail");
      const edge = dto.edges.find((e) => e.from.nodeId === "agent1" && e.to.nodeId === mcpNodeId);
      expect(edge).toBeDefined();
    });

    it("emits no MCP nodes when mcpServers is absent", () => {
      const agentConfig = makeMinimalAgentConfig();
      const snapshot = makeSnapshot("agent1", agentConfig);

      const dto = mapper.map(snapshot);

      const mcpNodes = dto.nodes.filter((n) => ConnectionNodeIdFactory.isMcpConnectionNodeId(n.id));
      expect(mcpNodes).toHaveLength(0);
    });
  });
});
