import type { Logger } from "@codemation/host/next/server";

export type RunTestCommandOptions = Readonly<{
  suiteId: string;
  consumerRoot?: string;
}>;

export class RunTestCommand {
  constructor(private readonly cliLogger: Logger) {}

  async execute(_options: RunTestCommandOptions): Promise<void> {
    this.cliLogger.info("Not yet implemented");
  }
}
