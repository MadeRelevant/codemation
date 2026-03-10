export type CodemationCliCommandName = "dev" | "host" | "worker" | "help";

export type CodemationCliParsedCommand = Readonly<{
  name: CodemationCliCommandName;
  options: ReadonlyMap<string, string | true>;
}>;

export type CodemationResolvedPaths = Readonly<{
  consumerRoot: string;
  workspaceRoot: string | null;
  repoRoot: string;
  applicationRoot: string;
  cliEntrypointPath: string;
}>;

export type CodemationResolvedPorts = Readonly<{
  frontendPort: number;
  websocketPort: number;
}>;

export type CodemationPlannedRuntime = Readonly<{
  mode: "memory" | "redis";
  shouldStartWorker: boolean;
}>;

export type CodemationSharedEnvironment = Readonly<{
  baseEnv: NodeJS.ProcessEnv;
  nextEnv: NodeJS.ProcessEnv;
  workerEnv: NodeJS.ProcessEnv;
}>;
