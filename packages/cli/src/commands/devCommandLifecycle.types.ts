import type { ChildProcess } from "node:child_process";

import type { DevResolvedAuthSettings } from "../dev/DevAuthSettingsLoader";
import type { ResolvedRuntimeToolEntrypoint } from "../dev/RuntimeToolEntrypointResolver";
import type { CliPaths } from "../path/CliPathResolver";

export type DevMode = "packaged-ui" | "watch-framework";

/** Mutable child process handles and stop coordination (shared across dev session helpers). */
export type DevMutableProcessState = {
  currentGateway: ChildProcess | null;
  currentDevUi: ChildProcess | null;
  currentPackagedUi: ChildProcess | null;
  currentPackagedUiBaseUrl: string | null;
  isRestartingUi: boolean;
  stopRequested: boolean;
  stopResolve: (() => void) | null;
  stopReject: ((error: Error) => void) | null;
};

/** Immutable inputs resolved before any child processes are spawned. */
export type DevPreparedRuntime = Readonly<{
  paths: CliPaths;
  devMode: DevMode;
  nextPort: number;
  gatewayPort: number;
  authSettings: DevResolvedAuthSettings;
  developmentServerToken: string;
  gatewayEntrypoint: ResolvedRuntimeToolEntrypoint;
  runtimeEntrypoint: ResolvedRuntimeToolEntrypoint;
  runtimeWorkingDirectory: string;
  discoveredPluginPackagesJson: string;
  consumerEnv: Readonly<Record<string, string>>;
}>;
