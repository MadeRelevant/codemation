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
  plugins: [{ packageName: "@codemation/example-plugin", source: "discovered" }],
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
  assert.match(out, /@codemation\/example-plugin/);
  assert.match(out, /Active workflows/);
  assert.match(out, /Plugins/);
});

test("DevCliBannerRenderer renderCompact omits full banner subtitle", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderCompact(sampleSummary);
  });
  assert.match(out, /Runtime \(updated\)/);
  assert.doesNotMatch(out, /AI Automation framework/);
});

test("DevCliBannerRenderer renderBrandHeader then renderRuntimeSummary matches renderFull", () => {
  const renderer = new DevCliBannerRenderer();
  const splitOut = captureStdout(() => {
    renderer.renderBrandHeader();
    renderer.renderRuntimeSummary(sampleSummary);
  });
  const fullOut = captureStdout(() => {
    new DevCliBannerRenderer().renderFull(sampleSummary);
  });
  assert.equal(splitOut, fullOut);
});

test("DevCliBannerRenderer renderBrandHeader includes subtitle", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderBrandHeader();
  });
  assert.match(out, /AI Automation framework/);
});

test("DevCliBannerRenderer renderGatewayListeningHint highlights gateway URL (packaged UI)", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderGatewayListeningHint(3000, "dev:plugin", "packaged-ui");
  });
  assert.match(out, /Codemation is running/);
  assert.match(out, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(out, /dev:plugin/);
  assert.match(out, /--watch-framework/);
});

test("DevCliBannerRenderer renderGatewayListeningHint shows Next URL and dev gateway when ports differ", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderGatewayListeningHint(3000, "dev", "watch-framework", 41234);
  });
  assert.match(out, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(out, /dev gateway \(API \+ runtime\) is at http:\/\/127\.0\.0\.1:41234/);
  assert.doesNotMatch(out, /--watch-framework/);
});

test("DevCliBannerRenderer renderGatewayListeningHint watch-framework short footer when gateway matches browser", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderGatewayListeningHint(3000, "dev", "watch-framework", 3000);
  });
  assert.match(out, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(out, /Open the URL above for the Next\.js UI/);
});
