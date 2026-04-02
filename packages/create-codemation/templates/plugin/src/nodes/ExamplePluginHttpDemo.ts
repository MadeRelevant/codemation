import type { CredentialRequirement, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { ExamplePluginHttpDemoNode } from "./ExamplePluginHttpDemoNode";

/** Credential slot key referenced by {@link ExamplePluginHttpDemo.getCredentialRequirements} and the node implementation. */
export const examplePluginApiKeySlotKey = "exampleApiKey";

export type ExamplePluginHttpDemoOutputJson = Readonly<{
  /** Stable httpbin image URL so the workflow output shows a concrete “binary-like” preview URL. */
  demoImageUrl: string;
  /** Length of the key echoed back by httpbin (proves the credential was sent on the wire). */
  echoedKeyLength: number;
  httpStatus: number;
}>;

export class ExamplePluginHttpDemo implements RunnableNodeConfig<
  Record<string, unknown>,
  ExamplePluginHttpDemoOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExamplePluginHttpDemoNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: examplePluginApiKeySlotKey,
        label: "Example API key",
        acceptedTypes: ["example.api-key"],
      },
    ];
  }
}
