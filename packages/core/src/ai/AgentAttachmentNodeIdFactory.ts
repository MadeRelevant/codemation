import type { NodeId } from "../types";

export class AgentAttachmentNodeIdFactory {
  static createLanguageModelNodeId(parentNodeId: NodeId, invocationIndex?: number): NodeId {
    return invocationIndex === undefined ? `${parentNodeId}::llm` : `${parentNodeId}::llm::${this.normalizeInvocationIndex(invocationIndex)}`;
  }

  static parseLanguageModelNodeId(nodeId: NodeId): Readonly<{ parentNodeId: NodeId; invocationIndex: number }> | null {
    const parts = nodeId.split("::");
    if (parts.length < 3 || parts.at(-2) !== "llm") return null;
    const invocationIndex = this.parseInvocationIndex(parts.at(-1));
    if (invocationIndex === null) return null;
    const parentNodeId = parts.slice(0, -2).join("::");
    return parentNodeId ? { parentNodeId, invocationIndex } : null;
  }

  static getBaseLanguageModelNodeId(nodeId: NodeId): NodeId {
    const parsed = this.parseLanguageModelNodeId(nodeId);
    return parsed ? this.createLanguageModelNodeId(parsed.parentNodeId) : nodeId;
  }

  static createToolNodeId(parentNodeId: NodeId, toolName: string, invocationIndex?: number): NodeId {
    const normalizedToolName = this.normalizeToolName(toolName);
    return invocationIndex === undefined
      ? `${parentNodeId}::tool::${normalizedToolName}`
      : `${parentNodeId}::tool::${normalizedToolName}::${this.normalizeInvocationIndex(invocationIndex)}`;
  }

  static parseToolNodeId(nodeId: NodeId): Readonly<{ parentNodeId: NodeId; toolName: string; invocationIndex: number }> | null {
    const parts = nodeId.split("::");
    if (parts.length < 4 || parts.at(-3) !== "tool") return null;
    const toolName = parts.at(-2);
    const invocationIndex = this.parseInvocationIndex(parts.at(-1));
    if (!toolName || invocationIndex === null) return null;
    const parentNodeId = parts.slice(0, -3).join("::");
    return parentNodeId ? { parentNodeId, toolName, invocationIndex } : null;
  }

  static getBaseToolNodeId(nodeId: NodeId): NodeId {
    const parsed = this.parseToolNodeId(nodeId);
    return parsed ? this.createToolNodeId(parsed.parentNodeId, parsed.toolName) : nodeId;
  }

  private static normalizeToolName(toolName: string): string {
    return toolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
  }

  private static normalizeInvocationIndex(invocationIndex: number): number {
    if (!Number.isInteger(invocationIndex) || invocationIndex < 1) {
      throw new Error(`Agent attachment invocation index must be a positive integer. Received: ${invocationIndex}`);
    }
    return invocationIndex;
  }

  private static parseInvocationIndex(value: string | undefined): number | null {
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    return Number.parseInt(value, 10);
  }
}

