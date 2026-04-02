import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const hostPackageRoot = path.resolve(scriptsDir, "..", "..", "..");

const child = spawn("pnpm", ["exec", "playwright", "test", "-c", "playwright.scaffolded-dev.config.ts"], {
  cwd: hostPackageRoot,
  stdio: "inherit",
  env: { ...process.env },
});

const exitCode = await new Promise<number>((resolve, reject) => {
  child.once("exit", (code) => {
    resolve(code ?? 1);
  });
  child.once("error", (error) => {
    reject(error instanceof Error ? error : new Error(String(error)));
  });
});

process.exit(exitCode);
