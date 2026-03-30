import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export type NextHostConsumerServerCommand = Readonly<{
  args: ReadonlyArray<string>;
  command: string;
  cwd: string;
}>;

export class NextHostConsumerServerCommandFactory {
  async create(args: Readonly<{ nextHostRoot: string }>): Promise<NextHostConsumerServerCommand> {
    const standaloneServerPath = path.resolve(
      args.nextHostRoot,
      ".next",
      "standalone",
      "packages",
      "next-host",
      "server.js",
    );
    if (await this.exists(standaloneServerPath)) {
      return {
        command: process.execPath,
        args: [standaloneServerPath],
        cwd: path.dirname(standaloneServerPath),
      };
    }
    return {
      command: "pnpm",
      args: ["exec", "next", "start"],
      cwd: args.nextHostRoot,
    };
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
