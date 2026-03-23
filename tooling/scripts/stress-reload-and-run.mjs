#!/usr/bin/env node
/**
 * Verifies hot reload for a probe workflow: rewrites the console.log marker, triggers /dev/reload,
 * then starts a run via the Next proxy (or runtime URL). Check runtime-dev stdout for the new marker.
 *
 * Prereq: `codemation dev` running, DATABASE_URL set for the consumer.
 *
 * Usage:
 *   node tooling/scripts/stress-reload-and-run.mjs --next-url http://127.0.0.1:3000 --runtime-url http://127.0.0.1:RT
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
    nextUrl: "",
    runtimeUrl: "",
    token: process.env.CODEMATION_DEV_SERVER_TOKEN ?? "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--next-url" && argv[i + 1]) {
      out.nextUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--runtime-url" && argv[i + 1]) {
      out.runtimeUrl = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--token" && argv[i + 1]) {
      out.token = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.nextUrl || !args.runtimeUrl) {
    console.error("Usage: node stress-reload-and-run.mjs --next-url http://127.0.0.1:3000 --runtime-url http://127.0.0.1:RT");
    process.exit(1);
  }
  const repoRoot = resolveRepoRoot();
  const probePath = path.join(repoRoot, "apps/test-dev/src/workflows/dev/hot-reload-probe.ts");
  const original = await readFile(probePath, "utf8");
  const marker = `HOT_RELOAD_PROBE_MARKER:probe-${Date.now()}`;
  const updated = original.replace(/HOT_RELOAD_PROBE_MARKER:[^\s"]+/u, marker);
  if (updated === original) {
    console.error("Could not find HOT_RELOAD_PROBE_MARKER in probe file.");
    process.exit(1);
  }
  await writeFile(probePath, updated, "utf8");
  try {
    const rt = args.runtimeUrl.replace(/\/$/, "");
    await fetch(`${rt}/dev/reload`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(args.token ? { "x-codemation-dev-token": args.token } : {}),
      },
      body: JSON.stringify({ changedPaths: [probePath] }),
    });
    await delay(800);
    const nx = args.nextUrl.replace(/\/$/, "");
    const workflowsResponse = await fetch(`${nx}/api/workflows`);
    if (!workflowsResponse.ok) {
      console.error(`GET /api/workflows failed: ${workflowsResponse.status}`);
      process.exit(1);
    }
    const workflows = await workflowsResponse.json();
    const list = Array.isArray(workflows) ? workflows : [];
    const probe = list.find((w) => w.id === "wf.hot-reload-probe");
    if (!probe) {
      console.error("Probe workflow wf.hot-reload-probe not found in /api/workflows response.");
      process.exit(1);
    }
    const startResponse = await fetch(`${nx}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflowId: "wf.hot-reload-probe" }),
    });
    if (!startResponse.ok) {
      const text = await startResponse.text();
      console.error(`POST /api/runs failed: ${startResponse.status} ${text}`);
      process.exit(1);
    }
    console.log(`Started run for wf.hot-reload-probe. Expect console to include: ${marker}`);
    console.log("Verify the codemation runtime-dev process stdout shows that marker.");
  } finally {
    await writeFile(probePath, original, "utf8");
  }
}

await main();
