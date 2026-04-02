import type { Container } from "@codemation/core";

export type DevApiRuntimeContext = Readonly<{
  buildVersion: string;
  container: Container;
  consumerRoot: string;
  repoRoot: string;
  workflowIds: ReadonlyArray<string>;
  workflowSources: ReadonlyArray<string>;
}>;

export type DevApiRuntimeFactoryArgs = Readonly<{
  consumerRoot: string;
  configPathOverride?: string;
  env: NodeJS.ProcessEnv;
  runtimeWorkingDirectory: string;
}>;

export type DevApiRuntimeServerHandle = Readonly<{
  buildVersion: string;
  httpPort: number;
  stop: () => Promise<void>;
  workflowIds: ReadonlyArray<string>;
  workflowWebSocketPort: number;
}>;
