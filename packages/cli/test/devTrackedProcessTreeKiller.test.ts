import { spawn } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DevTrackedProcessTreeKiller } from "../src/dev/DevTrackedProcessTreeKiller";

describe("DevTrackedProcessTreeKiller", () => {
  const killer = new DevTrackedProcessTreeKiller();

  it("terminates a detached child and its process group on Unix", async () => {
    if (process.platform === "win32") {
      return;
    }
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1e9)"], {
      detached: true,
      stdio: "ignore",
    });
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("Expected child pid");
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
    await killer.killProcessTreeRootedAt(child);
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200);
    });
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("allows a detached Unix child to exit gracefully before forcing termination", async () => {
    if (process.platform === "win32") {
      return;
    }
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "codemation-dev-kill-"));
    const markerPath = path.join(tempDirectory, "graceful.txt");
    const child = spawn(
      process.execPath,
      [
        "-e",
        [
          "const fs = require('node:fs');",
          `const markerPath = ${JSON.stringify(markerPath)};`,
          "process.on('SIGTERM', () => {",
          "  setTimeout(() => {",
          "    fs.writeFileSync(markerPath, 'graceful');",
          "    process.exit(0);",
          "  }, 50);",
          "});",
          "setInterval(() => {}, 1e9);",
        ].join(" "),
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("Expected child pid");
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
    await killer.killProcessTreeRootedAt(child);
    await access(markerPath);
    expect(await readFile(markerPath, "utf8")).toBe("graceful");
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("terminates a detached child process tree on Windows", async () => {
    if (process.platform !== "win32") {
      return;
    }
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1e9)"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    const pid = child.pid;
    if (pid === undefined) {
      throw new Error("Expected child pid");
    }
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        resolve();
      });
    });
    await killer.killProcessTreeRootedAt(child);
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 400);
    });
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
