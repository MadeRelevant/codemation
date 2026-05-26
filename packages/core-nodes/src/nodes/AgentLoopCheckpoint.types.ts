import type { ModelMessage } from "ai";

/**
 * Snapshot of the agent loop state at the moment of HITL suspension.
 * Serialized as JSON and stored on `SuspensionRequest.request.metadata.agentCheckpoint`
 * so the resumed node can reconstruct and continue the conversation.
 *
 * Defined here (story 10) and consumed in `AIAgentNode` resume branch.
 */
export type AgentLoopCheckpoint = Readonly<{
  /** Full conversation history up to and including the assistant message that emitted tool_use. */
  conversation: ModelMessage[];
  /** Turn count at the point of suspension (1-based, matches loop counter in runTurnLoopUntilFinalAnswer). */
  turnCount: number;
  /** Total tool-call count accumulated before suspension. */
  toolCallCount: number;
  /** The tool_use id that triggered suspension; matched against the tool_result on resume. */
  pendingToolCallId: string;
  /** Display name of the agent (for logging / telemetry continuity). */
  agentName: string;
  /** Model identifier carried for migration-safety redundancy. */
  modelId: string;
}>;
