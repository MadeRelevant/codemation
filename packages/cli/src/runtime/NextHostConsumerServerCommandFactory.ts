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
      // Bind loopback so `codemation dev` health probes (`http://127.0.0.1:<port>`) work in Docker,
      // where `process.env.HOSTNAME` is the container id and would otherwise be used by `next start`.
      args: ["exec", "next", "start", "-H", "127.0.0.1"],
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
