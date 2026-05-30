import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackageMetadataExtractor } from "../PackageMetadataExtractor.js";

class TempPackageFixture {
  readonly dir: string;

  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), "codemation-extractor-test-"));
  }

  writeFile(relPath: string, content: string): void {
    const full = path.join(this.dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }

  cleanup(): void {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

describe("PackageMetadataExtractor", () => {
  let fixture: TempPackageFixture;
  let extractor: PackageMetadataExtractor;

  beforeEach(() => {
    fixture = new TempPackageFixture();
    extractor = new PackageMetadataExtractor();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("basic package.json reading", () => {
    it("reads name, version, description", () => {
      fixture.writeFile(
        "package.json",
        JSON.stringify({ name: "@test/pkg", version: "1.2.3", description: "Test package" }),
      );
      fixture.writeFile("src/.keep", "");

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.schemaVersion).toBe(1);
      expect(metadata.packageName).toBe("@test/pkg");
      expect(metadata.packageVersion).toBe("1.2.3");
      expect(metadata.description).toBe("Test package");
    });

    it("defaults description to empty string when missing", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));
      fixture.writeFile("src/.keep", "");

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.description).toBe("");
    });
  });

  describe("@nodeMetadata decorator extraction", () => {
    it("extracts node name and description from @nodeMetadata", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/MyNode.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({
  name: "MyNode",
  packageName: "@test/nodes",
  description: "Does something useful.",
})
export class MyNode {}
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.nodes).toHaveLength(1);
      expect(metadata.nodes![0].name).toBe("MyNode");
      expect(metadata.nodes![0].description).toBe("Does something useful.");
      expect(metadata.nodes![0].kind).toBe("node");
      expect(metadata.nodes![0].inputPorts).toEqual(["main"]);
      expect(metadata.nodes![0].outputPorts).toEqual(["main"]);
    });

    it("extracts custom outputPorts from @nodeMetadata ports object", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/IfNode.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({
  name: "If",
  packageName: "@test/nodes",
  description: "Routes by predicate.",
  ports: { true: {}, false: {} },
})
export class If {}
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);
      const node = metadata.nodes![0];

      expect(node.outputPorts).toContain("true");
      expect(node.outputPorts).toContain("false");
    });

    it("extracts declaredOutputPorts from class property", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/SwitchNode.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({
  name: "Switch",
  packageName: "@test/nodes",
  description: "Routes by key.",
})
export class Switch {
  readonly declaredOutputPorts = ["caseA", "caseB"] as const;
}
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);
      const node = metadata.nodes![0];

      expect(node.outputPorts).toContain("caseA");
      expect(node.outputPorts).toContain("caseB");
    });

    it("detects trigger kind from class property", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/MyTrigger.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({
  name: "MyTrigger",
  packageName: "@test/nodes",
  description: "A trigger node.",
})
export class MyTrigger {
  readonly kind = "trigger" as const;
}
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.nodes![0].kind).toBe("trigger");
    });

    it("extracts multiple nodes from different files", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/NodeA.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({ name: "NodeA", packageName: "@test/nodes", description: "A." })
export class NodeA {}
        `.trim(),
      );
      fixture.writeFile(
        "src/nodes/NodeB.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({ name: "NodeB", packageName: "@test/nodes", description: "B." })
export class NodeB {}
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.nodes).toHaveLength(2);
      const names = metadata.nodes!.map((n) => n.name).sort();
      expect(names).toEqual(["NodeA", "NodeB"]);
    });
  });

  describe("defineNode extraction", () => {
    it("extracts node title, description, and credential refs from defineNode", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/analyzeDoc.ts",
        `
import { defineNode } from "@codemation/core";
import { myCredentialType } from "../credentials/myCredential";

export const analyzeDocNode = defineNode({
  key: "my-pkg.analyze-doc",
  title: "Analyze Document",
  description: "Runs analysis on a document.",
  icon: "lucide:scan-text",
  input: { binaryField: "data" },
  credentials: {
    contentUnderstanding: {
      type: myCredentialType,
      label: "My credential",
      helpText: "Bind a credential.",
    },
  },
  async execute() {},
});
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);
      const node = metadata.nodes![0];

      expect(node.name).toBe("Analyze Document");
      expect(node.description).toBe("Runs analysis on a document.");
      expect(node.credentialRefs).toBeDefined();
    });
  });

  describe("example extraction", () => {
    it("skips examples when src/examples does not exist", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile("src/.keep", "");

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.examples).toBeUndefined();
    });

    it("extracts examples from src/examples/*.example.ts", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/examples", version: "1.0.0" }));
      fixture.writeFile(
        "src/examples/send-email.example.ts",
        `
/**
 * Sends a Gmail message using the workflow builder.
 * @tags gmail, email
 * @uses @codemation/core-nodes-gmail
 */
export const workflow = {};
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.examples).toHaveLength(1);
      const ex = metadata.examples![0];
      expect(ex.name).toBe("send-email");
      expect(ex.description).toContain("Sends a Gmail message");
      expect(ex.tags).toContain("gmail");
      expect(ex.tags).toContain("email");
      expect(ex.code).toContain("workflow");
      expect(ex.sourcePath).toContain("send-email.example.ts");
    });
  });

  describe("codemation.metadata.json override", () => {
    it("uses override nodes instead of extracting from source", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/nodes/Plain.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({ name: "PlainNode", packageName: "@test/nodes", description: "Plain." })
export class Plain {}
        `.trim(),
      );
      fixture.writeFile(
        "codemation.metadata.json",
        JSON.stringify({
          nodes: [
            {
              name: "OverrideNode",
              kind: "node",
              description: "Overridden.",
              inputPorts: ["main"],
              outputPorts: ["main"],
              sourcePath: "src/nodes/Override.ts",
            },
          ],
        }),
      );

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.nodes).toHaveLength(1);
      expect(metadata.nodes![0].name).toBe("OverrideNode");
    });
  });

  describe("kind determination", () => {
    it("sets kind to 'nodes' when only nodes found", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/N.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({ name: "N", packageName: "@test/nodes", description: "." })
export class N {}
        `.trim(),
      );

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.kind).toBe("nodes");
    });

    it("sets kind to 'examples' when only examples found", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/examples", version: "1.0.0" }));
      fixture.writeFile("src/examples/e.example.ts", `/** Example. */\nexport const x = 1;`);

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.kind).toBe("examples");
    });

    it("sets kind to 'mixed' when both nodes and examples found", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/mixed", version: "1.0.0" }));
      fixture.writeFile(
        "src/N.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({ name: "N", packageName: "@test/mixed", description: "." })
export class N {}
        `.trim(),
      );
      fixture.writeFile("src/examples/e.example.ts", `/** Example. */\nexport const x = 1;`);

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.kind).toBe("mixed");
    });
  });

  describe("skills extraction (Story 02)", () => {
    it("skips skills when skills/ directory does not exist", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/pkg", version: "1.0.0" }));
      fixture.writeFile("src/.keep", "");

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.skills).toBeUndefined();
    });

    it("extracts skills from skills/<slug>/SKILL.md", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/skills", version: "1.0.0" }));
      fixture.writeFile(
        "skills/my-skill/SKILL.md",
        `---
name: my-skill
description: A test skill.
tags: workflow, dsl
---

# Body
`,
      );

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.skills).toHaveLength(1);
      const skill = metadata.skills![0];
      expect(skill.name).toBe("my-skill");
      expect(skill.description).toBe("A test skill.");
      expect(skill.tags).toEqual(["workflow", "dsl"]);
      expect(skill.sourcePath).toContain("SKILL.md");
      expect(skill.code).toContain("# Body");
    });

    it("sets kind to 'skills' for a package with only skills", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/skills", version: "1.0.0" }));
      fixture.writeFile(
        "skills/my-skill/SKILL.md",
        `---
name: my-skill
description: A test skill.
tags: test
---
`,
      );

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.kind).toBe("skills");
    });

    it("sets kind to 'mixed' when package has both nodes and skills", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/mixed", version: "1.0.0" }));
      fixture.writeFile(
        "src/N.ts",
        `
import { nodeMetadata } from "@codemation/core";
@nodeMetadata({ name: "N", packageName: "@test/mixed", description: "." })
export class N {}
        `.trim(),
      );
      fixture.writeFile(
        "skills/my-skill/SKILL.md",
        `---
name: my-skill
description: A skill.
tags: test
---
`,
      );

      const metadata = extractor.extract(fixture.dir);
      expect(metadata.kind).toBe("mixed");
    });
  });

  describe("credential extraction", () => {
    it("extracts credentials from defineCredential calls", () => {
      fixture.writeFile("package.json", JSON.stringify({ name: "@test/nodes", version: "1.0.0" }));
      fixture.writeFile(
        "src/credentials/myCredential.ts",
        `
import { defineCredential } from "@codemation/core";
export const myCredentialType = defineCredential({
  key: "my.credential",
  label: "My Credential",
  description: "A test credential.",
  public: {
    endpoint: {
      key: "endpoint",
      label: "Endpoint",
      type: "string" as const,
      required: true,
    },
  },
  secret: {
    apiKey: {
      key: "apiKey",
      label: "API Key",
      type: "password" as const,
      required: true,
    },
  },
  async createSession(args) { return args; },
  async test() { return { status: "healthy", message: "ok", testedAt: new Date().toISOString() }; },
});
        `.trim(),
      );
      fixture.writeFile("src/nodes/.keep", "");

      const metadata = extractor.extract(fixture.dir);

      expect(metadata.credentials).toBeDefined();
      expect(metadata.credentials!.length).toBeGreaterThan(0);
      const cred = metadata.credentials![0];
      expect(cred.name).toBe("my.credential");
      expect(cred.description).toBe("A test credential.");
      expect(cred.fields.some((f) => f.key === "endpoint")).toBe(true);
      expect(cred.fields.some((f) => f.key === "apiKey")).toBe(true);
    });
  });
});
