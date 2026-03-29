export class CodemationBootstrapRequest {
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly workflowSources: ReadonlyArray<string>;
  readonly env?: Readonly<NodeJS.ProcessEnv>;

  constructor(
    args: Readonly<{
      consumerRoot: string;
      repoRoot: string;
      workflowSources?: ReadonlyArray<string>;
      env?: Readonly<NodeJS.ProcessEnv>;
    }>,
  ) {
    this.consumerRoot = args.consumerRoot;
    this.repoRoot = args.repoRoot;
    this.workflowSources = [...(args.workflowSources ?? [])];
    this.env = args.env;
  }

  resolveEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(this.env ?? {}),
    };
  }
}
