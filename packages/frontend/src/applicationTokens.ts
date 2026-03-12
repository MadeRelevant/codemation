import type { TypeToken } from "@codemation/core";
import type { RealtimeRuntimeDiagnostics } from "./realtimeRuntimeFactory";

export const ApplicationTokens = {
  RealtimeRuntimeDiagnostics: Symbol.for("codemation.application.RealtimeRuntimeDiagnostics") as TypeToken<RealtimeRuntimeDiagnostics>,
  WebSocketPort: Symbol.for("codemation.application.WebSocketPort") as TypeToken<number>,
  WebSocketBindHost: Symbol.for("codemation.application.WebSocketBindHost") as TypeToken<string>,
  RealtimeWatchRoots: Symbol.for("codemation.application.RealtimeWatchRoots") as TypeToken<ReadonlyArray<string>>,
} as const;
