import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "vitest";

import { DevNextChildProcessOutputFilter } from "../src/dev/DevNextChildProcessOutputFilter";
import { DevNextStartupBannerLineFilter } from "../src/dev/DevNextStartupBannerLineFilter";

function captureStdoutWrite(run: () => Promise<void>): Promise<string> {
  const written: string[] = [];
  const prev = process.stdout.write.bind(process.stdout);
  process.stdout.write = function (chunk: string | Uint8Array, ..._rest: unknown[]): boolean {
    written.push(String(chunk));
    return true;
  };
  return run()
    .finally(() => {
      process.stdout.write = prev;
    })
    .then(() => written.join(""));
}

test("DevNextChildProcessOutputFilter drops banner lines and forwards the rest", async () => {
  const out = await captureStdoutWrite(async () => {
    const child = spawn(process.execPath, ["-e", `console.log("▲ Next.js 1"); console.log("keep this line");`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    new DevNextChildProcessOutputFilter(new DevNextStartupBannerLineFilter()).attach(child);
    await new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        if ((code ?? 0) === 0) {
          resolve();
          return;
        }
        reject(new Error(`child exited ${code}`));
      });
      child.on("error", reject);
    });
  });
  assert.match(out, /keep this line/);
  assert.doesNotMatch(out, /▲ Next\.js/);
});
