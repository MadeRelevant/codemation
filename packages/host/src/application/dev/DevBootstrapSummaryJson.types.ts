export type DevBootstrapSummaryJson = Readonly<{
  logLevel: string;
  codemationLogLevelEnv?: string;
  databaseLabel: string;
  schedulerLabel: string;
  eventBusLabel: string;
  redisUrlRedacted?: string;
  activeWorkflows: ReadonlyArray<Readonly<{ id: string; name: string }>>;
  plugins: ReadonlyArray<
    Readonly<{
      packageName: string;
      source: "configured" | "discovered";
    }>
  >;
}>;
