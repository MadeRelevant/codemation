import type { NodeId } from "../../types";

/**
 * Deterministic ids for workflow connection-owned child nodes (LLM slot, tools, etc.).
 * These are stable across loads.
 */
export class ConnectionNodeIdFactory {
  static readonly connectionSegment = "__conn__" as const;

  static languageModelConnectionNodeId(parentNodeId: NodeId): NodeId {
    return `${parentNodeId}${this.connectionSegment}llm`;
  }

  static toolConnectionNodeId(parentNodeId: NodeId, toolName: string): NodeId {
    const normalized = this.normalizeToolName(toolName);
    return `${parentNodeId}${this.connectionSegment}tool${this.connectionSegment}${normalized}`;
  }

  static isLanguageModelConnectionNodeId(nodeId: NodeId): boolean {
    return nodeId.endsWith(`${this.connectionSegment}llm`);
  }

  static isToolConnectionNodeId(nodeId: NodeId): boolean {
    return nodeId.includes(`${this.connectionSegment}tool${this.connectionSegment}`);
  }

  /** True when `nodeId` is a connection-owned child of `parentNodeId` (LLM or tool slot). */
  static isConnectionOwnedDescendantOf(parentNodeId: NodeId, nodeId: NodeId): boolean {
    return nodeId.startsWith(`${parentNodeId}${this.connectionSegment}`);
  }

  /** Normalizes a tool display name to a stable id segment. */
  static normalizeToolName(toolName: string): string {
    return (
      toolName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "tool"
    );
  }
}
