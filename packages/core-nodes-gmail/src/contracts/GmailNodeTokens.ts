import type { TypeToken } from "@codemation/core";

export const GmailNodeTokens = {
  GmailNodesOptions: Symbol.for("codemation.core-nodes-gmail.GmailNodesOptions") as TypeToken<unknown>,
  TriggerLogger: Symbol.for("codemation.core-nodes-gmail.TriggerLogger") as TypeToken<unknown>,
  RuntimeLogger: Symbol.for("codemation.core-nodes-gmail.RuntimeLogger") as TypeToken<unknown>,
} as const;
