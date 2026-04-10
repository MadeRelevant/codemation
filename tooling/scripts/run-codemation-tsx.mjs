import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

class CodemationTsxRunner {
  run(argv) {
    const [entrypoint, tsconfig, ...rest] = argv;
    if (!entrypoint || !tsconfig) {
      process.stderr.write("Usage: node tooling/scripts/run-codemation-tsx.mjs <entrypoint> <tsconfig> [args...]\n");
      process.exitCode = 1;
      return;
    }
    const require = createRequire(import.meta.url);
    const tsxPackageJsonPath = require.resolve("tsx/package.json");
    const tsxCliPath = path.join(path.dirname(tsxPackageJsonPath), "dist", "cli.mjs");
    const env = {
      ...process.env,
      NODE_OPTIONS: this.appendDevelopmentCondition(process.env.NODE_OPTIONS),
    };
    const child = spawn(process.execPath, [tsxCliPath, "--tsconfig", tsconfig, entrypoint, ...rest], {
      stdio: "inherit",
      env,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  }

  appendDevelopmentCondition(existingNodeOptions) {
    const options = [];
    if (typeof existingNodeOptions === "string" && existingNodeOptions.trim().length > 0) {
      options.push(existingNodeOptions.trim());
    }
    if (!options.some((value) => value.includes("--conditions=development"))) {
      options.push("--conditions=development");
    }
    return options.join(" ").trim();
  }
}

new CodemationTsxRunner().run(process.argv.slice(2));
