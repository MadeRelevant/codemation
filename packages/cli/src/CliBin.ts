import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import process from "node:process";

import { CliProgramFactory } from "./CliProgramFactory";

const binLogger = new ServerLoggerFactory(logLevelPolicyFactory).create("codemation-cli.bin");

export class CliBin {
  static async run(argv: ReadonlyArray<string>): Promise<void> {
    try {
      const cli = new CliProgramFactory().create();
      await cli.run([...argv]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      binLogger.error(message);
      process.exitCode = 1;
    }
  }
}
