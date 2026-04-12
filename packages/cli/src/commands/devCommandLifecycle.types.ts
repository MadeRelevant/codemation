import type { ChildProcess } from "node:child_process";

import type { DevApiRuntimeServerHandle } from "../dev/DevApiRuntimeFactory";
import type { NextHostEdgeSeed } from "../dev/NextHostEdgeSeedLoader";
import type { CliPaths } from "../path/CliPathResolver";

export type DevMode = "packaged-ui" | "watch-framework";

/** Mutable child process handles and stop coordination (shared across dev session helpers). */
export type DevMutableProcessState = {
  currentDevUi: ChildProcess | null;
  currentPackagedUi: ChildProcess | null;
  currentPackagedUiBaseUrl: string | null;
  currentRuntime: DevApiRuntimeServerHandle | null;
  currentWorkspacePluginBuilds: ReadonlyArray<ChildProcess>;
  isRestartingUi: boolean;
  stopRequested: boolean;
  stopResolve: (() => void) | null;
  stopReject: ((error: Error) => void) | null;
};

/** Immutable inputs resolved before any child processes are spawned. */
export type DevPreparedRuntime = Readonly<{
  paths: CliPaths;
  configPathOverride?: string;
  devMode: DevMode;
  nextPort: number;
  gatewayPort: number;
  authSettings: NextHostEdgeSeed;
  developmentServerToken: string;
  consumerEnv: Readonly<Record<string, string>>;
}>;
