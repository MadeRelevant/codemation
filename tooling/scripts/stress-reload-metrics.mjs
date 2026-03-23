#!/usr/bin/env node
/**
 * While `codemation dev` is running with runtime-dev, repeatedly touches a workflow file
 * (same strategy as stress-workflow-changes) and samples GET /dev/metrics.
 *
 * Usage:
 *   node tooling/scripts/stress-reload-metrics.mjs --runtime-url http://127.0.0.1:PORT [--iterations 200] [--interval-ms 400]
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

function resolveRepoRoot() {
  let dir = path.dirname(new URL(import.meta.url).pathname);
  while (dir !== "/") {
    if (path.basename(dir) === "tooling") {
      return path.dirname(dir);
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not resolve repository root from tooling/scripts.");
}

function parseArgs(argv) {
  const out = {
    runtimeUrl: "",
    iterations: 200,
    intervalMs: 400,
    targetFile: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--runtime-url" && argv[i + 1]) {
      out.runtimeUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--iterations" && argv[i + 1]) {
      out.iterations = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === "--interval-ms" && argv[i + 1]) {
      out.intervalMs = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (a === "--file" && argv[i + 1]) {
      out.targetFile = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.runtimeUrl || args.runtimeUrl.trim().length === 0) {
    console.error("Missing --runtime-url (e.g. http://127.0.0.1:3456)");
    process.exit(1);
  }
  const repoRoot = resolveRepoRoot();
  const defaultTarget = path.join(
    repoRoot,
    "apps/test-dev/src/workflows/dev/hot-reload-probe.ts",
  );
  const target = args.targetFile.trim().length > 0 ? path.resolve(args.targetFile) : defaultTarget;
  const base = args.runtimeUrl.replace(/\/$/, "");
  const original = await readFile(target, "utf8");
  const samples = [];
  try {
    for (let i = 0; i < args.iterations; i += 1) {
      const stamp = `${Date.now()}-${i}`;
      const nextContent = `${original}\n// stress-reload-metrics ${stamp}\n`;
      await writeFile(target, nextContent, "utf8");
      await delay(args.intervalMs);
      try {
        const response = await fetch(`${base}/dev/metrics`, {
          headers: {
            "x-codemation-dev-token": process.env.CODEMATION_DEV_SERVER_TOKEN ?? "",
          },
        });
        if (!response.ok) {
          console.warn(`[stress-reload-metrics] metrics status=${response.status}`);
          continue;
        }
        const json = await response.json();
        const heap = json.memoryUsage?.heapUsed;
        samples.push(typeof heap === "number" ? heap : null);
        if (i % 25 === 0) {
          console.log(`[stress-reload-metrics] iteration=${i} heapUsed=${heap}`);
        }
      } catch (error) {
        console.warn(`[stress-reload-metrics] metrics fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await writeFile(target, original, "utf8");
  }
  const valid = samples.filter((v) => v !== null);
  if (valid.length < 10) {
    console.error("[stress-reload-metrics] not enough samples; is runtime-dev running?");
    process.exit(1);
  }
  const first = valid.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const last = valid.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const growth = last - first;
  console.log(`[stress-reload-metrics] heap growth first10 vs last10 avg: ${growth} bytes`);
  if (growth > 256 * 1024 * 1024) {
    console.error("[stress-reload-metrics] FAIL: heap grew more than 256MB between warmup and end.");
    process.exit(1);
  }
}

await main();
