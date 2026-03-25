import process from "node:process";

import { CliProgramFactory } from "./CliProgramFactory";

export class CliBin {
  static async run(argv: ReadonlyArray<string>): Promise<void> {
    try {
      const cli = new CliProgramFactory().create();
      await cli.run([...argv]);
    } catch (error) {
      // Always print to stderr: host ServerLogger respects CODEMATION_LOG_LEVEL=silent and would
      // suppress logger.error here; Prisma/DB errors also need the full Error (message + stack).
      console.error("codemation:", error);
      process.exitCode = 1;
    }
  }
}
