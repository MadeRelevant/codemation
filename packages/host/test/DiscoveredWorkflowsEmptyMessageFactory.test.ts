import assert from "node:assert/strict";
import { test } from "vitest";

import { DiscoveredWorkflowsEmptyMessageFactory } from "../src/presentation/server/DiscoveredWorkflowsEmptyMessageFactory";

const factory = new DiscoveredWorkflowsEmptyMessageFactory();

test("create lists paths and guidance", () => {
  const message = factory.create(["/app/src/workflows/lib/helpers.ts"]);
  assert.ok(message.includes("Discovered 1 file(s)"));
  assert.ok(message.includes("helpers.ts"));
  assert.ok(message.includes("src/lib"));
});
