import type { AgentMessageDto, AgentToolCall } from "@codemation/core";

import type { AssistantModelMessage, ModelMessage, ToolModelMessage } from "ai";

import type { ExecutedToolCall } from "./aiAgentSupport.types";

/**
 * AI-SDK-shaped message construction for the AIAgent stack. Emits plain `ModelMessage[]`
 * ( `{ role: 'system' | 'user' | 'assistant' | 'tool', content: ... }` ) as consumed by
 * `generateText({ messages })` from the `ai` package.
 */
export class AgentMessageFactory {
  static createPromptMessages(messages: ReadonlyArray<AgentMessageDto>): ReadonlyArray<ModelMessage> {
    return messages.map((message) => this.createPromptMessage(message));
  }

  /**
   * Builds the assistant message that contains optional text plus one or more tool-call parts,
   * matching the shape AI SDK emits between steps.
   */
  static createAssistantWithToolCalls(
    text: string | undefined,
    toolCalls: ReadonlyArray<AgentToolCall>,
  ): AssistantModelMessage {
    const content: AssistantModelMessage["content"] = [];
    if (text && text.length > 0) {
      content.push({ type: "text", text });
    }
    for (const toolCall of toolCalls) {
      content.push({
        type: "tool-call",
        toolCallId: toolCall.id ?? toolCall.name,
        toolName: toolCall.name,
        input: toolCall.input ?? {},
      });
    }
    return { role: "assistant", content };
  }

  /**
   * Builds the `{ role: "tool", content: [{ type: "tool-result", ... }, ...] }` message returned
   * to the model after each tool round.
   */
  static createToolResultsMessage(executedToolCalls: ReadonlyArray<ExecutedToolCall>): ToolModelMessage {
    return {
      role: "tool",
      content: executedToolCalls.map((executed) => ({
        type: "tool-result",
        toolCallId: executed.toolCallId,
        toolName: executed.toolName,
        output: {
          type: "json",
          value: AgentMessageFactory.toToolResultJson(executed.result),
        },
      })),
    };
  }

  private static toToolResultJson(value: unknown): import("ai").JSONValue {
    if (value === undefined) return null;
    try {
      return JSON.parse(JSON.stringify(value)) as import("ai").JSONValue;
    } catch {
      return String(value);
    }
  }

  private static createPromptMessage(message: AgentMessageDto): ModelMessage {
    if (message.role === "system") {
      return { role: "system", content: message.content };
    }
    if (message.role === "assistant") {
      return { role: "assistant", content: message.content };
    }
    return { role: "user", content: message.content };
  }
}
