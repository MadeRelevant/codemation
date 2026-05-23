import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "vitest";

import { ExampleVerifyCommand } from "../src/commands/ExampleVerifyCommand";

let tmpDir: string;
let counter = 0;

beforeEach(() => {
  counter += 1;
  tmpDir = path.join(os.tmpdir(), `example-verify-test-${counter}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeExample(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

test("ExampleVerifyCommand rejects a non-.example.ts file", async () => {
  const filePath = writeExample("my-workflow.ts", "export default {};");
  const command = new ExampleVerifyCommand();
  await assert.rejects(() => command.execute(filePath), /must end in .example\.ts/);
});

test("ExampleVerifyCommand rejects a missing file", async () => {
  const command = new ExampleVerifyCommand();
  await assert.rejects(() => command.execute(path.join(tmpDir, "nonexistent.example.ts")), /File not found/);
});

test("ExampleVerifyCommand rejects a file missing @description", async () => {
  const content = `
/**
 * @tags automation
 */
export default { id: "x", name: "x", nodes: [], edges: [] };
`;
  const filePath = writeExample("missing-desc.example.ts", content);
  const command = new ExampleVerifyCommand();
  await assert.rejects(() => command.execute(filePath), /@description/);
});

test("ExampleVerifyCommand rejects a file missing @tags", async () => {
  const content = `
/**
 * @description A test example.
 */
export default { id: "x", name: "x", nodes: [], edges: [] };
`;
  const filePath = writeExample("missing-tags.example.ts", content);
  const command = new ExampleVerifyCommand();
  await assert.rejects(() => command.execute(filePath), /@tags/);
});

test("ExampleVerifyCommand rejects a default export that is not a WorkflowDefinition", async () => {
  const content = `
/**
 * @description A test example.
 * @tags test
 */
export default { message: "not a workflow" };
`;
  const filePath = writeExample("bad-shape.example.ts", content);
  const command = new ExampleVerifyCommand();
  await assert.rejects(() => command.execute(filePath), /WorkflowDefinition/);
});

test("ExampleVerifyCommand accepts a valid example with correct frontmatter and shape", async () => {
  const content = `
/**
 * @description A minimal test example.
 * @tags test, minimal
 */
export default { id: "example.test", name: "Test", nodes: [], edges: [] };
`;
  const filePath = writeExample("valid.example.ts", content);
  const command = new ExampleVerifyCommand();
  // Should not throw
  await command.execute(filePath);
});
