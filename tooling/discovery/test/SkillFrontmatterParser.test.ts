import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillFrontmatterParser } from "../SkillFrontmatterParser.js";

class TempFixture {
  readonly dir: string;
  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfp-test-"));
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

describe("SkillFrontmatterParser", () => {
  let fixture: TempFixture;
  let parser: SkillFrontmatterParser;

  beforeEach(() => {
    fixture = new TempFixture();
    parser = new SkillFrontmatterParser();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("parses name, description, tags, and uses from frontmatter", () => {
    fixture.writeFile(
      "skills/my-skill/SKILL.md",
      `---
name: my-skill
description: Does something useful.
tags: workflow, dsl
uses: "@codemation/core-nodes"
---

# Body content
`,
    );
    // Install a fake node_modules entry for the uses package
    fixture.writeFile(
      "node_modules/@codemation/core-nodes/package.json",
      JSON.stringify({ name: "@codemation/core-nodes", version: "1.3.0" }),
    );

    const skillDir = path.join(fixture.dir, "skills", "my-skill");
    const result = parser.parse(skillDir, fixture.dir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-skill");
    expect(result!.description).toBe("Does something useful.");
    expect(result!.tags).toEqual(["workflow", "dsl"]);
    expect(result!.sourcePath).toContain("SKILL.md");
  });

  it("resolves uses packages to concrete versions via node_modules", () => {
    fixture.writeFile(
      "skills/my-skill/SKILL.md",
      `---
name: my-skill
description: A skill.
tags: node
uses: "@codemation/core-nodes"
---
`,
    );
    fixture.writeFile(
      "node_modules/@codemation/core-nodes/package.json",
      JSON.stringify({ name: "@codemation/core-nodes", version: "1.5.2" }),
    );

    const skillDir = path.join(fixture.dir, "skills", "my-skill");
    const result = parser.parse(skillDir, fixture.dir);

    expect(result!.dependencies["@codemation/core-nodes"]).toBe("1.5.2");
  });

  it("returns empty dependencies for a skill with no uses (conceptual skill)", () => {
    fixture.writeFile(
      "skills/concepts/SKILL.md",
      `---
name: codemation-framework-concepts
description: Explains framework boundaries.
tags: concepts, architecture
---

# Body
`,
    );

    const skillDir = path.join(fixture.dir, "skills", "concepts");
    const result = parser.parse(skillDir, fixture.dir);

    expect(result!.dependencies).toEqual({});
  });

  it("parses SKILL.md with Windows-style CRLF line endings correctly", () => {
    const crlfContent = "---\r\nname: crlf-skill\r\ndescription: CRLF test.\r\ntags: test\r\n---\r\n\r\n# Body\r\n";
    fixture.writeFile("skills/crlf/SKILL.md", crlfContent);

    const skillDir = path.join(fixture.dir, "skills", "crlf");
    const result = parser.parse(skillDir, fixture.dir);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("crlf-skill");
    expect(result!.description).toBe("CRLF test.");
    expect(result!.tags).toEqual(["test"]);
  });

  it("returns null when SKILL.md is missing", () => {
    fs.mkdirSync(path.join(fixture.dir, "skills", "empty"), { recursive: true });
    const skillDir = path.join(fixture.dir, "skills", "empty");
    expect(parser.parse(skillDir, fixture.dir)).toBeNull();
  });

  it("falls back to directory slug as name when frontmatter name is absent", () => {
    fixture.writeFile(
      "skills/my-slug/SKILL.md",
      `---
description: No name field.
---
`,
    );
    const skillDir = path.join(fixture.dir, "skills", "my-slug");
    const result = parser.parse(skillDir, fixture.dir);
    expect(result!.name).toBe("my-slug");
  });

  it("includes the full SKILL.md source (frontmatter + body) in the code field", () => {
    const content = `---
name: full-source
description: Test.
---

# Body text here
`;
    fixture.writeFile("skills/full-source/SKILL.md", content);
    const skillDir = path.join(fixture.dir, "skills", "full-source");
    const result = parser.parse(skillDir, fixture.dir);
    expect(result!.code).toBe(content);
  });

  describe("regression guard (D8): monorepo-based version resolution", () => {
    it("resolves uses via monorepo packages/ directory when pnpm-workspace.yaml is present", () => {
      // Set up a minimal monorepo-like structure
      fixture.writeFile("pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n");
      fixture.writeFile(
        "packages/core-nodes/package.json",
        JSON.stringify({ name: "@codemation/core-nodes", version: "2.1.0" }),
      );

      // Skill package is a sub-directory
      fixture.writeFile(
        "packages/agent-skills/skills/my-skill/SKILL.md",
        `---
name: my-skill
description: Uses core-nodes.
tags: agent, llm
uses: "@codemation/core-nodes"
---
`,
      );

      const skillDir = path.join(fixture.dir, "packages", "agent-skills", "skills", "my-skill");
      const packageRoot = path.join(fixture.dir, "packages", "agent-skills");
      const result = parser.parse(skillDir, packageRoot);

      // Resolved from monorepo, NOT from node_modules (which doesn't exist here)
      expect(result!.dependencies["@codemation/core-nodes"]).toBe("2.1.0");
      // Regression guard: must be a non-empty concrete version string
      expect(result!.dependencies["@codemation/core-nodes"]).toMatch(/^\d+\.\d+\.\d+/);
    });
  });
});
