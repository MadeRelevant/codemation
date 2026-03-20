import process from "node:process";
import { CodemationCli } from "./CodemationCliProgram";

export class CodemationCliBin {
  static async run(argv: ReadonlyArray<string>): Promise<void> {
    try {
      const cli = new CodemationCli();
      await cli.run([...argv]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    }
  }
}
