#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const thisDirectory = path.dirname(fileURLToPath(import.meta.url));
const entrypointPath = path.resolve(thisDirectory, "..", "dist", "bin.js");
const childProcess = spawn(process.execPath, [entrypointPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"]) {
  process.on(signal, () => {
    if (childProcess.exitCode === null) {
      childProcess.kill(signal);
    }
  });
}

childProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});
