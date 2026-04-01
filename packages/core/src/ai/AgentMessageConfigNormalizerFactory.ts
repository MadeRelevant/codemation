import type {
  AgentMessageBuildArgs,
  AgentMessageConfig,
  AgentMessageDto,
  AgentMessageLine,
  AgentNodeConfig,
} from "./AiHost";

export class AgentMessageConfigNormalizer {
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

  private static normalizeRichMessages<TInputJson>(
    config: AgentMessageConfig<TInputJson>,
    args: AgentMessageBuildArgs<TInputJson>,
  ): ReadonlyArray<AgentMessageDto> {
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
