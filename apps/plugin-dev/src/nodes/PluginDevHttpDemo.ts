import type { CredentialRequirement, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { PluginDevHttpDemoNode } from "./PluginDevHttpDemoNode";

export const pluginDevApiKeySlotKey = "pluginDevApiKey";

export type PluginDevHttpDemoOutputJson = Readonly<{
  demoImageUrl: string;
  echoedKeyLength: number;
  httpStatus: number;
}>;

export class PluginDevHttpDemo implements RunnableNodeConfig<Record<string, unknown>, PluginDevHttpDemoOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = PluginDevHttpDemoNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: pluginDevApiKeySlotKey,
        label: "Plugin dev API key",
        acceptedTypes: ["plugin-dev.api-key"],
      },
    ];
  }
}
