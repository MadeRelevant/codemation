import { isItemExpr } from "../contracts/itemExpr";

import type {
  AgentMessageBuildArgs,
  AgentMessageConfig,
  AgentMessageDto,
  AgentMessageLine,
  AgentMessageRole,
  AgentNodeConfig,
} from "./AiHost";

export class AgentMessageConfigNormalizer {
  /**
   * Prefer {@code input.messages} when present (ItemNode / engine-mapped payloads); otherwise resolve from
   * {@link AgentNodeConfig.messages} templates.
   */
  static resolveFromInputOrConfig<TInputJson, TOutputJson>(
    input: unknown,
    config: AgentNodeConfig<TInputJson, TOutputJson>,
    args: AgentMessageBuildArgs<TInputJson>,
  ): ReadonlyArray<AgentMessageDto> {
    const fromInput = this.tryMessagesFromStructuredInput(input);
    if (fromInput.length > 0) {
      return fromInput;
    }
    return this.normalize(config, args);
  }

  static normalize<TInputJson, TOutputJson>(
    config: AgentNodeConfig<TInputJson, TOutputJson>,
    args: AgentMessageBuildArgs<TInputJson>,
  ): ReadonlyArray<AgentMessageDto> {
    const fromMessages = this.normalizeRichMessages(config.messages, args);
    if (fromMessages.length > 0) {
      return fromMessages;
    }
    throw new Error(
      "AIAgent messages must be a non-empty array, or an object with a non-empty prompt array and/or buildMessages that returns messages.",
    );
  }

  private static tryMessagesFromStructuredInput(input: unknown): ReadonlyArray<AgentMessageDto> {
    if (!input || typeof input !== "object") {
      return [];
    }
    const raw = (input as { messages?: unknown }).messages;
    if (!Array.isArray(raw) || raw.length === 0) {
      return [];
    }
    const out: AgentMessageDto[] = [];
    for (const m of raw) {
      if (!m || typeof m !== "object") {
        continue;
      }
      const role = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if (role !== "system" && role !== "user" && role !== "assistant") {
        continue;
      }
      if (typeof content !== "string") {
        continue;
      }
      out.push({ role: role as AgentMessageRole, content });
    }
    return out;
  }

  private static normalizeRichMessages<TInputJson>(
    config: AgentMessageConfig<TInputJson>,
    args: AgentMessageBuildArgs<TInputJson>,
  ): ReadonlyArray<AgentMessageDto> {
    if (isItemExpr(config)) {
      throw new Error(
        "AIAgent messages wrapped in itemExpr(...) must be resolved by the engine before prompt normalization.",
      );
    }
    if (Array.isArray(config)) {
      return config.map((line) => this.lineToDto(line, args));
    }
    const structured = config as {
      readonly prompt?: ReadonlyArray<AgentMessageLine<TInputJson>>;
      readonly buildMessages?: (a: AgentMessageBuildArgs<TInputJson>) => ReadonlyArray<AgentMessageDto>;
    };
    const messages: AgentMessageDto[] = [];
    for (const line of structured.prompt ?? []) {
      messages.push(this.lineToDto(line, args));
    }
    for (const message of structured.buildMessages?.(args) ?? []) {
      messages.push(message);
    }
    return messages;
  }

  private static lineToDto<TInputJson>(
    line: AgentMessageLine<TInputJson>,
    args: AgentMessageBuildArgs<TInputJson>,
  ): AgentMessageDto {
    const content = typeof line.content === "function" ? line.content(args) : line.content;
    return { role: line.role, content };
  }
}
