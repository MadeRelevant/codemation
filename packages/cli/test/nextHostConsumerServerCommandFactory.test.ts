import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { NextHostConsumerServerCommandFactory } from "../src/runtime/NextHostConsumerServerCommandFactory";

test("prefers the packaged standalone Next host when present", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-next-host-"));
  try {
    const nextHostRoot = path.join(tempRoot, "next-host");
    const standaloneServerPath = path.join(nextHostRoot, ".next", "standalone", "packages", "next-host", "server.js");
    await mkdir(path.dirname(standaloneServerPath), { recursive: true });
    await writeFile(standaloneServerPath, "console.log('ok');\n", "utf8");

    const command = await new NextHostConsumerServerCommandFactory().create({ nextHostRoot });

    expect(command.command).toBe(process.execPath);
    expect(command.args).toEqual([standaloneServerPath]);
    expect(command.cwd).toBe(path.dirname(standaloneServerPath));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("falls back to next start when standalone output is unavailable", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-next-host-"));
  try {
    const nextHostRoot = path.join(tempRoot, "next-host");
    await mkdir(nextHostRoot, { recursive: true });

    const command = await new NextHostConsumerServerCommandFactory().create({ nextHostRoot });

    expect(command).toEqual({
      command: "pnpm",
      args: ["exec", "next", "start", "-H", "127.0.0.1"],
      cwd: nextHostRoot,
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
