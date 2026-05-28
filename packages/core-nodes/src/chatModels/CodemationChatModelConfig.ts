import type { AgentCanvasPresentation, ChatModelConfig } from "@codemation/core";

import type { CanvasIconName } from "../canvasIconName";
import { CodemationChatModelFactory } from "./CodemationChatModelFactory";

/**
 * A platform-managed model entry as returned by GET /api/llm/managed-models.
 */
export interface ManagedModelDto {
  id: string;
  modelId: string;
  displayName: string;
  providerKey: string;
  inputCostPerMTok: number;
  outputCostPerMTok: number;
  contextWindow: number;
  tier: string;
}

/**
 * Bifrost-namespaced model ID. Kept as `string` so runtime-fetched model IDs
 * (from the CP allowlist) work without compile-time enumeration.
 * Story C replaced the prior hardcoded union with this open type.
 */
export type CodemationManagedModel = string;

export class CodemationChatModelConfig implements ChatModelConfig {
  readonly type = CodemationChatModelFactory;
  readonly presentation: AgentCanvasPresentation<CanvasIconName>;
  readonly provider = "codemation-managed";
  readonly modelName: string;

  constructor(
    public readonly name: string,
    public readonly model: CodemationManagedModel,
    presentationIn?: AgentCanvasPresentation<CanvasIconName>,
    public readonly options?: Readonly<{
      temperature?: number;
      maxTokens?: number;
    }>,
  ) {
    this.modelName = model;
    this.presentation = presentationIn ?? { icon: "lucide:bot", label: name };
  }

  // No getCredentialRequirements() — authentication is implicit via workspace pairing secret.
}
