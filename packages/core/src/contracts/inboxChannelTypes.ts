import type { TypeToken } from "../di";
import type { HumanTaskActor, HumanTaskHandle, HumanTaskSubject } from "./runtimeTypes";
import type { Item } from "./workflowTypes";

/**
 * A single inbox delivery channel.
 * Implementations: `LocalInboxChannel`, `ControlPlaneInboxChannel`.
 */
export interface InboxChannel {
  readonly kind: "local" | "control-plane-inbox";
  deliver(args: InboxDeliverArgs): Promise<InboxDelivery>;
  updateOnDecision?(args: InboxOnDecisionArgs): Promise<void>;
  updateOnTimeout?(args: InboxOnTimeoutArgs): Promise<void>;
}

export type InboxDeliverArgs = Readonly<{
  task: HumanTaskHandle;
  subject: HumanTaskSubject;
  priority: "low" | "normal" | "high";
  item: Item;
  /** Present in managed mode (from `PairingConfig.workspaceId`). */
  workspaceId?: string;
}>;

export type InboxDelivery =
  | { kind: "local"; inboxItemId: string }
  | { kind: "cp"; inboxItemId: string; workspaceId: string };

export type InboxOnDecisionArgs = Readonly<{
  delivery: InboxDelivery;
  decision: { approved: boolean; note?: string };
  actor: HumanTaskActor;
}>;

export type InboxOnTimeoutArgs = Readonly<{
  delivery: InboxDelivery;
  policy: "halt" | "auto-accept";
}>;

/**
 * Resolves the correct `InboxChannel` for the current deployment mode
 * (local dev vs. managed/CP). Implemented in `@codemation/host`.
 */
export interface InboxChannelResolverSeam {
  resolve(): { channel: InboxChannel; workspaceId?: string };
}

export const InboxChannelResolverToken = Symbol.for("codemation.core.InboxChannelResolver") as TypeToken<
  InboxChannelResolverSeam | undefined
>;

export const LocalInboxChannelToken = Symbol.for("codemation.core.LocalInboxChannel") as TypeToken<
  InboxChannel | undefined
>;

export const ControlPlaneInboxChannelToken = Symbol.for("codemation.core.ControlPlaneInboxChannel") as TypeToken<
  InboxChannel | undefined
>;
