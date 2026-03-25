import type { TypeToken } from "@codemation/core";
import type { GmailApiClient } from "../services/GmailApiClient";
import type { GmailPubSubPullClient } from "../services/GmailPubSubPullClient";
import type { GmailLogger } from "./GmailLogger";
import type { GmailNodesOptions } from "./GmailNodesOptions";

export const GmailNodeTokens = {
  GmailApiClient: Symbol.for("codemation.core-nodes-gmail.GmailApiClient") as TypeToken<GmailApiClient>,
  GmailPubSubPullClient: Symbol.for(
    "codemation.core-nodes-gmail.GmailPubSubPullClient",
  ) as TypeToken<GmailPubSubPullClient>,
  GmailNodesOptions: Symbol.for("codemation.core-nodes-gmail.GmailNodesOptions") as TypeToken<GmailNodesOptions>,
  TriggerLogger: Symbol.for("codemation.core-nodes-gmail.TriggerLogger") as TypeToken<GmailLogger>,
  RuntimeLogger: Symbol.for("codemation.core-nodes-gmail.RuntimeLogger") as TypeToken<GmailLogger>,
} as const;
