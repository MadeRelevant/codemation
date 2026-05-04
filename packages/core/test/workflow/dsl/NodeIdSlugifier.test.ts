import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { NodeIdSlugifier } from "../../../src/workflow/dsl/NodeIdSlugifier.ts";

describe("NodeIdSlugifier.slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    assert.equal(NodeIdSlugifier.slugify("Send Gmail Message"), "send-gmail-message");
  });

  it("collapses non-alphanumeric runs including punctuation into a single dash", () => {
    assert.equal(NodeIdSlugifier.slugify("OpenAI: Chat"), "openai-chat");
  });

  it("trims surrounding whitespace (becomes leading/trailing dashes that are stripped)", () => {
    assert.equal(NodeIdSlugifier.slugify("   spaced   "), "spaced");
  });

  it("returns empty string for empty input", () => {
    assert.equal(NodeIdSlugifier.slugify(""), "");
  });

  it("handles unicode and punctuation runs", () => {
    assert.equal(NodeIdSlugifier.slugify("Héllo — Wörld!"), "h-llo-w-rld");
  });

  it("strips leading dashes produced after cleanup", () => {
    assert.equal(NodeIdSlugifier.slugify("---hello"), "hello");
  });

  it("strips trailing dashes produced after cleanup", () => {
    assert.equal(NodeIdSlugifier.slugify("hello---"), "hello");
  });

  it("handles strings with only non-alphanumeric characters", () => {
    assert.equal(NodeIdSlugifier.slugify("!!! ???"), "");
  });

  it("preserves numbers", () => {
    assert.equal(NodeIdSlugifier.slugify("Step 1: Parse"), "step-1-parse");
  });
});
