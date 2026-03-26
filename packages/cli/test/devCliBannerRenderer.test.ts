import assert from "node:assert/strict";
import { test } from "vitest";
import type { DevBootstrapSummaryJson } from "@codemation/host/next/server";

import { DevCliBannerRenderer } from "../src/dev/DevCliBannerRenderer";

const sampleSummary: DevBootstrapSummaryJson = {
  logLevel: "info",
  databaseLabel: "in-memory (no Prisma persistence)",
  schedulerLabel: "inline (this process)",
  eventBusLabel: "in-memory",
  activeWorkflows: [{ id: "wf1", name: "Sample workflow" }],
};

function captureStdout(run: () => void): string {
  const written: string[] = [];
  const prev = process.stdout.write;
  process.stdout.write = function (chunk: string | Uint8Array, ...args: unknown[]): boolean {
    written.push(String(chunk));
    return prev.apply(process.stdout, [chunk, ...args] as Parameters<typeof prev>);
  };
  try {
    run();
  } finally {
    process.stdout.write = prev;
  }
  return written.join("");
}

test("DevCliBannerRenderer renderFull includes subtitle and workflow names", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderFull(sampleSummary);
  });
  assert.match(out, /AI Automation framework/);
  assert.match(out, /Sample workflow/);
  assert.match(out, /Active workflows/);
});

test("DevCliBannerRenderer renderCompact omits full banner subtitle", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderCompact(sampleSummary);
  });
  assert.match(out, /Runtime \(updated\)/);
  assert.doesNotMatch(out, /AI Automation framework/);
});
