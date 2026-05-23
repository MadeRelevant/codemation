import type { AgentMcpIntegration, AgentMcpToolMap } from "./agentMcpTypes";

/**
 * No-op implementation of AgentMcpIntegration.
 * Registered by the core engine runtime as a fallback when the host does not
 * supply a real implementation (e.g. in unit tests or headless engine setups).
 * Always returns an empty tool map so the agent runs with node-backed tools only.
 */
export class NoOpAgentMcpIntegration implements AgentMcpIntegration {
  async prepareMcpTools(): Promise<AgentMcpToolMap> {
    return new Map();
  }
}
