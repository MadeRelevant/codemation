import * as fs from "node:fs";
import * as path from "node:path";
import { ExampleFrontmatterParser } from "./ExampleFrontmatterParser.js";
import type { SkillMetadata } from "./PackageMetadata.types.js";

/**
 * Parses YAML-frontmatter Markdown (`SKILL.md`) files into `SkillMetadata`.
 *
 * Expected YAML frontmatter fields (between `---` fences):
 *   name:         Display name (slug fallback if absent)
 *   description:  Free-form description
 *   tags:         Comma-separated list of tags
 *   uses:         Comma-separated @codemation/* package names the skill embeds
 *                 version-sensitive snippets for (omit for conceptual skills — D7)
 */
export class SkillFrontmatterParser {
  private readonly exampleParser = new ExampleFrontmatterParser();

  parse(skillDir: string, packageRoot: string): SkillMetadata | null {
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) return null;

    const source = fs.readFileSync(skillMdPath, "utf8");
    const { name, description, tags, uses } = this.extractFrontmatter(source);
    const slugName = path.basename(skillDir);
    const resolvedDeps = this.resolveDependencies(uses, packageRoot);
    const relPath = path.relative(packageRoot, skillMdPath);

    return {
      name: name || slugName,
      description,
      tags,
      sourcePath: relPath,
      dependencies: resolvedDeps,
      code: source,
    };
  }

  private extractFrontmatter(source: string): {
    name: string;
    description: string;
    tags: string[];
    uses: string[];
  } {
    const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
    const fm = frontmatterMatch?.[1] ?? "";
    let name = "";
    let description = "";
    const tags: string[] = [];
    const uses: string[] = [];

    for (const line of fm.split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim().toLowerCase();
      // Strip surrounding single or double quotes from YAML string values
      const rawValue = line.slice(colon + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");
      if (key === "name") name = value;
      else if (key === "description") description = value;
      else if (key === "tags")
        tags.push(
          ...value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      else if (key === "uses")
        uses.push(
          ...value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
    }

    return { name, description, tags, uses };
  }

  private resolveDependencies(uses: string[], packageRoot: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pkg of uses) {
      if (!pkg.startsWith("@codemation/")) continue; // first-party only (D9)
      const concrete =
        this.resolveFromMonorepo(pkg, packageRoot) ?? this.exampleParser.resolveConcreteVersion(pkg, packageRoot);
      if (concrete) {
        result[pkg] = concrete;
      } else {
        process.stderr.write(
          `[extract-metadata] warn: could not resolve concrete version for ${pkg} ` +
            `(referenced in skill at ${packageRoot})\n`,
        );
      }
    }
    return result;
  }

  /**
   * Resolve pkg against the monorepo workspace package source tree (D8 Option A).
   * Walks up from packageRoot looking for pnpm-workspace.yaml + packages/<slug>/package.json.
   */
  private resolveFromMonorepo(pkg: string, packageRoot: string): string | null {
    const slug = pkg.includes("/") ? pkg.split("/")[1] : pkg;
    let dir = packageRoot;
    for (let i = 0; i < 8; i++) {
      const workspaceYaml = path.join(dir, "pnpm-workspace.yaml");
      const pkgJsonPath = path.join(dir, "packages", slug, "package.json");
      if (fs.existsSync(workspaceYaml) && fs.existsSync(pkgJsonPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { version?: string };
          if (typeof parsed.version === "string") return parsed.version;
        } catch {
          /* malformed — keep walking */
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }
}
