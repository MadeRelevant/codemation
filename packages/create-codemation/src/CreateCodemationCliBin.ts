import process from "node:process";

import { CreateCodemationProgramFactory } from "./CreateCodemationProgramFactory";

export class CreateCodemationCliBin {
  static async run(argv: ReadonlyArray<string>, importMetaUrl: string): Promise<void> {
    try {
      const cli = new CreateCodemationProgramFactory(importMetaUrl).create();
      await cli.run(argv);
    } catch (error) {
      console.error("create-codemation:", error);
      process.exitCode = 1;
    }
  }
}
