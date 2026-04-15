import type { CredentialRequirement, ItemExprArgs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { GmailCredentialTypes } from "../contracts/GmailCredentialTypes";
import type { GmailMessageRecord } from "../services/GmailApiClient";
import { ModifyGmailLabelsNode } from "./ModifyGmailLabelsNode";

export type ModifyGmailLabelsTarget = "message" | "thread";

export type GmailLabelConfigValue<T, TItemJson = unknown> =
  | T
  | Readonly<{ fn: (args: ItemExprArgs<TItemJson>) => T | Promise<T> }>;

export type ModifyGmailLabelsOptions<TItemJson = unknown> = Readonly<{
  target?: ModifyGmailLabelsTarget;
  messageId?: GmailLabelConfigValue<string | undefined, TItemJson>;
  threadId?: GmailLabelConfigValue<string | undefined, TItemJson>;
  addLabelIds?: GmailLabelConfigValue<string | ReadonlyArray<string> | undefined, TItemJson>;
  removeLabelIds?: GmailLabelConfigValue<string | ReadonlyArray<string> | undefined, TItemJson>;
  addLabels?: GmailLabelConfigValue<string | ReadonlyArray<string> | undefined, TItemJson>;
  removeLabels?: GmailLabelConfigValue<string | ReadonlyArray<string> | undefined, TItemJson>;
}>;

export type GmailThreadLabelMutationResult = Readonly<{
  target: "thread";
  threadId: string;
  addLabelIds: ReadonlyArray<string>;
  removeLabelIds: ReadonlyArray<string>;
}>;

export type ModifyGmailLabelsOutputJson = GmailMessageRecord | GmailThreadLabelMutationResult;

export class ModifyGmailLabels implements RunnableNodeConfig<unknown, ModifyGmailLabelsOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ModifyGmailLabelsNode;

  constructor(
    public readonly name: string,
    public readonly cfg: ModifyGmailLabelsOptions = {},
    public readonly id?: string,
  ) {}

  get target(): ModifyGmailLabelsTarget {
    return this.cfg.target ?? "message";
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "auth",
        label: "Gmail account",
        acceptedTypes: [GmailCredentialTypes.oauth],
        helpText: "Bind a Gmail OAuth credential that resolves to an authenticated Gmail session.",
      },
    ];
  }
}

export { ModifyGmailLabelsNode } from "./ModifyGmailLabelsNode";
