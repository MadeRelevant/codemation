import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import { SourceMapNodeOptions } from "../runtime/SourceMapNodeOptions";

export class ServeWorkerCommand {
  private readonly require = createRequire(import.meta.url);

  constructor(private readonly sourceMapNodeOptions: SourceMapNodeOptions) {}

  async execute(consumerRoot: string, configPathOverride?: string): Promise<void> {
    const workerPackageRoot = path.dirname(this.require.resolve("@codemation/worker-cli/package.json"));
    const workerBin = path.join(workerPackageRoot, "bin", "codemation-worker.js");
    const args = [workerBin];
    if (configPathOverride !== undefined && configPathOverride.trim().length > 0) {
      args.push("--config", path.resolve(process.cwd(), configPathOverride.trim()));
    }
    args.push("--consumer-root", consumerRoot);
    const child = spawn(process.execPath, args, {
      cwd: consumerRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: this.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
      },
    });
    await new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        if ((code ?? 0) === 0) {
          resolve();
          return;
        }
        reject(new Error(`codemation-worker exited with code ${code ?? 0}.`));
      });
      child.on("error", reject);
    });
  }
}
