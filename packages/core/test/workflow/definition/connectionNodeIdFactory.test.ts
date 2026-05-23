import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { ConnectionNodeIdFactory } from "../../../src/workflow/definition/ConnectionNodeIdFactory";

describe("ConnectionNodeIdFactory", () => {
  test("languageModelConnectionNodeId produces expected format", () => {
    const id = ConnectionNodeIdFactory.languageModelConnectionNodeId("node-1");
    assert.equal(id, "node-1__conn__llm");
  });

  test("toolConnectionNodeId produces expected format", () => {
    const id = ConnectionNodeIdFactory.toolConnectionNodeId("node-2", "My Tool");
    assert.equal(id, "node-2__conn__tool__conn__my_tool");
  });

  test("isLanguageModelConnectionNodeId returns true for llm id", () => {
    const id = ConnectionNodeIdFactory.languageModelConnectionNodeId("parent");
    assert.equal(ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(id), true);
  });

  test("isLanguageModelConnectionNodeId returns false for non-llm id", () => {
    assert.equal(ConnectionNodeIdFactory.isLanguageModelConnectionNodeId("parent__conn__tool__conn__fn"), false);
  });

  test("isToolConnectionNodeId returns true for tool id", () => {
    const id = ConnectionNodeIdFactory.toolConnectionNodeId("parent", "add");
    assert.equal(ConnectionNodeIdFactory.isToolConnectionNodeId(id), true);
  });

  test("isToolConnectionNodeId returns false for llm id", () => {
    const id = ConnectionNodeIdFactory.languageModelConnectionNodeId("parent");
    assert.equal(ConnectionNodeIdFactory.isToolConnectionNodeId(id), false);
  });

  test("parseLanguageModelConnectionNodeId extracts parentNodeId", () => {
    const id = ConnectionNodeIdFactory.languageModelConnectionNodeId("node-abc");
    const parsed = ConnectionNodeIdFactory.parseLanguageModelConnectionNodeId(id);
    assert.deepEqual(parsed, { parentNodeId: "node-abc" });
  });

  test("parseLanguageModelConnectionNodeId returns undefined for non-llm id", () => {
    assert.equal(ConnectionNodeIdFactory.parseLanguageModelConnectionNodeId("other-id"), undefined);
  });

  test("parseToolConnectionNodeId extracts parent and tool name", () => {
    const id = ConnectionNodeIdFactory.toolConnectionNodeId("parent-x", "Search Tool");
    const parsed = ConnectionNodeIdFactory.parseToolConnectionNodeId(id);
    assert.ok(parsed);
    assert.equal(parsed.parentNodeId, "parent-x");
    assert.equal(parsed.normalizedToolName, "search_tool");
  });

  test("parseToolConnectionNodeId returns undefined for non-tool id", () => {
    assert.equal(ConnectionNodeIdFactory.parseToolConnectionNodeId("just-a-node"), undefined);
  });

  test("isConnectionOwnedDescendantOf matches child of parent", () => {
    const id = ConnectionNodeIdFactory.languageModelConnectionNodeId("parent");
    assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("parent", id), true);
  });

  test("isConnectionOwnedDescendantOf does not match unrelated node", () => {
    assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("parent", "other-node"), false);
  });

  test("normalizeToolName lowercases and replaces special chars", () => {
    assert.equal(ConnectionNodeIdFactory.normalizeToolName("  Hello World! "), "hello_world");
  });

  test("normalizeToolName returns 'tool' for empty/punctuation-only input", () => {
    assert.equal(ConnectionNodeIdFactory.normalizeToolName("!!!"), "tool");
  });
});
