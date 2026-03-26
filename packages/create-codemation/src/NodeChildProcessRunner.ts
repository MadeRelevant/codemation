import { spawn } from "node:child_process";
import process from "node:process";

import type { ChildProcessRunnerPort } from "./ChildProcessRunnerPort";

export class NodeChildProcessRunner implements ChildProcessRunnerPort {
  async run(
    command: string,
    args: ReadonlyArray<string>,
    options: Readonly<{ cwd: string; env?: NodeJS.ProcessEnv }>,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: "inherit",
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Command "${command} ${args.join(" ")}" exited with code ${code ?? 0}.`));
      });
    });
  }
}
