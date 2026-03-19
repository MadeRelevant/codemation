import "reflect-metadata";
import process from "node:process";
import { CodemationCli } from "./CodemationCli";

export class CodemationCliBin {
  static async run(argv: ReadonlyArray<string>): Promise<void> {
    const cli = new CodemationCli();
    await cli.run([...argv]);
  }
}

void CodemationCliBin.run(process.argv.slice(2));

