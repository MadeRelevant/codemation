import type { AgentCanvasPresentation, ChatModelConfig, CredentialRequirement } from "@codemation/core";

import type { CanvasIconName } from "../canvasIconName";
import { OpenAIChatModelFactory } from "./OpenAIChatModelFactory";

export class OpenAIChatModelConfig implements ChatModelConfig {
  readonly type = OpenAIChatModelFactory;

  constructor(
    public readonly name: string,
    public readonly model: string,
    public readonly credentialSlotKey: string = "openai",
    public readonly presentation?: AgentCanvasPresentation<CanvasIconName>,
    public readonly options?: Readonly<{
      temperature?: number;
      maxTokens?: number;
    }>,
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: this.credentialSlotKey,
        label: "OpenAI API key",
        acceptedTypes: ["openai.apiKey"],
      },
    ];
  }
}
