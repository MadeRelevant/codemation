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

  static createSystemPrompt(systemMessage: string): ModelMessage {
    return { role: "system", content: systemMessage };
  }

  static createUserPrompt(prompt: string): ModelMessage {
    return { role: "user", content: prompt };
  }

  static createAssistantPrompt(prompt: string): ModelMessage {
    return { role: "assistant", content: prompt };
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

  static extractContent(message: unknown): string {
    if (typeof message === "string") return message;
    if (!this.isRecord(message)) return String(message);
    const content = message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (this.isRecord(part) && typeof part.text === "string") return part.text;
          return JSON.stringify(part);
        })
        .join("\n");
    }
    return JSON.stringify(content);
  }

  /**
   * Narrows any AI-SDK-shaped tool-call record to the provider-neutral `AgentToolCall` we use
   * internally.  Accepts both the AI SDK shape ( `{ type, toolCallId, toolName, input }` ) and the
   * legacy LangChain-ish shape ( `{ id, name, args }` ) for compatibility with scripted test
   * inputs.
   */
  static extractToolCalls(message: unknown): ReadonlyArray<AgentToolCall> {
    if (!this.isRecord(message)) return [];
    const candidate = message.toolCalls ?? message.tool_calls;
    if (!Array.isArray(candidate)) return [];
    const result: AgentToolCall[] = [];
    for (const raw of candidate) {
      if (!this.isRecord(raw)) continue;
      const id =
        typeof raw["toolCallId"] === "string"
          ? (raw["toolCallId"] as string)
          : typeof raw["id"] === "string"
            ? (raw["id"] as string)
            : undefined;
      const name =
        typeof raw["toolName"] === "string"
          ? (raw["toolName"] as string)
          : typeof raw["name"] === "string"
            ? (raw["name"] as string)
            : undefined;
      if (!name) continue;
      const input = "input" in raw ? raw["input"] : "args" in raw ? raw["args"] : undefined;
      result.push({ id, name, input });
    }
    return result;
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
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
      return this.createSystemPrompt(message.content);
    }
    if (message.role === "assistant") {
      return this.createAssistantPrompt(message.content);
    }
    return this.createUserPrompt(message.content);
  }
}
