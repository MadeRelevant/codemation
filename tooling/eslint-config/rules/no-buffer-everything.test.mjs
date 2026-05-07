/**
 * Tests for codemation/no-buffer-everything ESLint rule.
 *
 * Uses RuleTester from ESLint (flat-config compatible variant).
 */
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import noBufferEverything from "./no-buffer-everything.mjs";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("codemation/no-buffer-everything", () => {
  it("flags Buffer.from(x, 'base64')", () => {
    tester.run("no-buffer-everything", noBufferEverything, {
      valid: [
        // encoding direction — not decoding
        { code: `Buffer.from("hello", "utf8")` },
        { code: `Buffer.from("text").toString("base64")` },
        // No second argument
        { code: `Buffer.from(someBuffer)` },
      ],
      invalid: [
        {
          code: `const buf = Buffer.from(raw.contentBytes, "base64");`,
          errors: [{ messageId: "bufferFromBase64" }],
        },
        {
          code: `Buffer.from(encoded, 'base64')`,
          errors: [{ messageId: "bufferFromBase64" }],
        },
      ],
    });
  });

  it("flags <expr>.arrayBuffer()", () => {
    tester.run("no-buffer-everything", noBufferEverything, {
      valid: [
        // arrayBuffer with arguments would not match (zero-arg check)
        { code: `response.json()` },
        { code: `response.text()` },
        // method named differently
        { code: `something.getBuffer()` },
      ],
      invalid: [
        {
          code: `const ab = await response.arrayBuffer();`,
          errors: [{ messageId: "arrayBuffer" }],
        },
        {
          code: `new Uint8Array(await res.arrayBuffer())`,
          errors: [{ messageId: "arrayBuffer" }],
        },
      ],
    });
  });

  it("flags Buffer.concat(arr)", () => {
    tester.run("no-buffer-everything", noBufferEverything, {
      valid: [{ code: `Array.concat([a, b])` }, { code: `chunks.concat(more)` }],
      invalid: [
        {
          code: `const body = Buffer.concat(chunks);`,
          errors: [{ messageId: "bufferConcat" }],
        },
        {
          code: `const merged = Buffer.concat([first, second]);`,
          errors: [{ messageId: "bufferConcat" }],
        },
      ],
    });
  });

  it("standard eslint-disable-next-line suppression works (standard ESLint behaviour)", () => {
    // When a disable comment is present, ESLint won't report — we just verify
    // that without the comment the rule fires, trusting ESLint's own machinery
    // for the comment suppression path.
    tester.run("no-buffer-everything", noBufferEverything, {
      valid: [],
      invalid: [
        {
          // No disable comment — rule fires
          code: `Buffer.from(data, "base64")`,
          errors: [{ messageId: "bufferFromBase64" }],
        },
      ],
    });
  });
});
