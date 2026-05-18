import { describe, expect, it } from "vitest";
import { PackageMetadataValidator } from "../PackageMetadataValidator.js";
import type { PackageMetadata } from "../PackageMetadata.types.js";

function validMetadata(): PackageMetadata {
  return {
    schemaVersion: 1,
    packageName: "@test/pkg",
    packageVersion: "1.0.0",
    description: "A test package",
    kind: "nodes",
    nodes: [
      {
        name: "MyNode",
        kind: "node",
        description: "Does something.",
        inputPorts: ["main"],
        outputPorts: ["main"],
        sourcePath: "src/nodes/MyNode.ts",
      },
    ],
  };
}

describe("PackageMetadataValidator", () => {
  const validator = new PackageMetadataValidator();

  it("accepts a valid node package metadata", () => {
    const result = validator.validate(validMetadata());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts valid metadata with credentials and examples", () => {
    const metadata: PackageMetadata = {
      ...validMetadata(),
      kind: "mixed",
      credentials: [
        {
          name: "my.cred",
          description: "A credential",
          fields: [{ key: "apiKey", type: "password", required: true }],
        },
      ],
      examples: [
        {
          name: "my-example",
          description: "An example",
          tags: ["foo"],
          sourcePath: "src/examples/my-example.example.ts",
          dependencies: {},
          code: "export const x = 1;",
        },
      ],
    };
    const result = validator.validate(metadata);
    expect(result.valid).toBe(true);
  });

  describe("top-level field validation", () => {
    it("rejects non-object input", () => {
      expect(validator.validate(null).valid).toBe(false);
      expect(validator.validate("string").valid).toBe(false);
      expect(validator.validate(42).valid).toBe(false);
      expect(validator.validate([]).valid).toBe(false);
    });

    it("rejects wrong schemaVersion", () => {
      const result = validator.validate({ ...validMetadata(), schemaVersion: 2 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
    });

    it("rejects missing packageName", () => {
      const m = { ...validMetadata(), packageName: "" };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("packageName"))).toBe(true);
    });

    it("rejects missing packageVersion", () => {
      const m = { ...validMetadata(), packageVersion: "" };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
    });

    it("rejects invalid kind", () => {
      const m = { ...validMetadata(), kind: "invalid" as never };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("kind"))).toBe(true);
    });

    it("rejects missing description (non-string)", () => {
      const m = { ...validMetadata(), description: 42 as unknown as string };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
    });
  });

  describe("node validation", () => {
    it("rejects node with missing name", () => {
      const m = {
        ...validMetadata(),
        nodes: [{ ...validMetadata().nodes![0], name: "" }],
      };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("nodes[0].name"))).toBe(true);
    });

    it("rejects node with invalid kind", () => {
      const m = {
        ...validMetadata(),
        nodes: [{ ...validMetadata().nodes![0], kind: "invalid" as never }],
      };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
    });

    it("rejects node with missing sourcePath", () => {
      const m = {
        ...validMetadata(),
        nodes: [{ ...validMetadata().nodes![0], sourcePath: "" }],
      };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
    });

    it("rejects nodes that is not an array", () => {
      const m = { ...validMetadata(), nodes: "not an array" as unknown as never };
      const result = validator.validate(m);
      expect(result.valid).toBe(false);
    });
  });

  describe("credential validation", () => {
    function credBase() {
      return {
        ...validMetadata(),
        credentials: [{ name: "my.cred", description: "desc", fields: [{ key: "k", type: "string", required: true }] }],
      };
    }

    it("accepts valid credential", () => {
      expect(validator.validate(credBase()).valid).toBe(true);
    });

    it("rejects credential with non-boolean required", () => {
      const m = {
        ...credBase(),
        credentials: [
          {
            name: "c",
            description: "d",
            fields: [{ key: "k", type: "string", required: "yes" as unknown as boolean }],
          },
        ],
      };
      expect(validator.validate(m).valid).toBe(false);
    });

    it("rejects credential missing name", () => {
      const m = {
        ...credBase(),
        credentials: [{ name: "", description: "d", fields: [] }],
      };
      expect(validator.validate(m).valid).toBe(false);
    });
  });

  describe("example validation", () => {
    function exampleBase() {
      return {
        ...validMetadata(),
        kind: "examples" as const,
        nodes: undefined,
        examples: [
          {
            name: "ex",
            description: "An example",
            tags: ["foo"],
            sourcePath: "src/examples/ex.example.ts",
            dependencies: {},
            code: "export const x = 1;",
          },
        ],
      };
    }

    it("accepts valid example", () => {
      expect(validator.validate(exampleBase()).valid).toBe(true);
    });

    it("rejects example missing code", () => {
      const m = {
        ...exampleBase(),
        examples: [{ ...exampleBase().examples[0], code: 42 as unknown as string }],
      };
      expect(validator.validate(m).valid).toBe(false);
    });

    it("rejects example with non-array tags", () => {
      const m = {
        ...exampleBase(),
        examples: [{ ...exampleBase().examples[0], tags: "foo" as unknown as string[] }],
      };
      expect(validator.validate(m).valid).toBe(false);
    });

    it("rejects examples that is not an array", () => {
      const m = { ...exampleBase(), examples: {} as unknown as never };
      expect(validator.validate(m).valid).toBe(false);
    });
  });

  it("accumulates multiple errors", () => {
    const m = { schemaVersion: 2, packageName: "", packageVersion: "", description: 1 };
    const result = validator.validate(m);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(2);
  });
});
