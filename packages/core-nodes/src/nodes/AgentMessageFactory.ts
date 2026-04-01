import type { AgentMessageDto, AgentToolCall } from "@codemation/core";

import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";

export class AgentMessageFactory {
  static createPromptMessages(messages: ReadonlyArray<AgentMessageDto>): ReadonlyArray<BaseMessage> {
    return messages.map((message) => this.createPromptMessage(message));
  }

  static createSystemPrompt(systemMessage: string): SystemMessage {
    return new SystemMessage(systemMessage);
  }

  static createUserPrompt(prompt: string): HumanMessage {
    return new HumanMessage(prompt);
  }

  static createAssistantPrompt(prompt: string): AIMessage {
    return new AIMessage(prompt);
  }

  static createToolMessage(toolCallId: string, content: string): ToolMessage {
    return new ToolMessage({ tool_call_id: toolCallId, content });
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

  static extractToolCalls(message: unknown): ReadonlyArray<AgentToolCall> {
    if (!this.isRecord(message)) return [];
    const toolCalls = message.tool_calls;
    if (!Array.isArray(toolCalls)) return [];
    return toolCalls
      .filter((toolCall) => this.isRecord(toolCall) && typeof toolCall.name === "string")
      .map((toolCall) => ({
        id: typeof toolCall.id === "string" ? toolCall.id : undefined,
        name: toolCall.name as string,
        input: this.isRecord(toolCall) && "args" in toolCall ? toolCall.args : undefined,
      }));
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private static createPromptMessage(message: AgentMessageDto): BaseMessage {
    if (message.role === "system") {
      return this.createSystemPrompt(message.content);
    }
    if (message.role === "assistant") {
      return this.createAssistantPrompt(message.content);
    }
    return this.createUserPrompt(message.content);
  }
}
