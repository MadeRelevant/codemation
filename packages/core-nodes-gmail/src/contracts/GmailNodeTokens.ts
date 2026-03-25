import type { TypeToken } from "@codemation/core";
import type { GmailApiClient } from "../services/GmailApiClient";

export const GmailNodeTokens = {
  GmailApiClient: Symbol.for("codemation.core-nodes-gmail.GmailApiClient") as TypeToken<GmailApiClient>,
  GmailNodesOptions: Symbol.for("codemation.core-nodes-gmail.GmailNodesOptions") as TypeToken<unknown>,
  TriggerLogger: Symbol.for("codemation.core-nodes-gmail.TriggerLogger") as TypeToken<unknown>,
  RuntimeLogger: Symbol.for("codemation.core-nodes-gmail.RuntimeLogger") as TypeToken<unknown>,
} as const;
