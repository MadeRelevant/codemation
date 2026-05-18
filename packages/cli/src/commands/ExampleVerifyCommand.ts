import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * `codemation example:verify <path>` — per-file fast feedback for example authors.
 *
 * Checks:
 *  1. File exists and has a `.example.ts` extension.
 *  2. JSDoc frontmatter contains required @description and @tags tags.
 *  3. The file's default export is a WorkflowDefinition (has id, name, nodes, edges).
 */
export class ExampleVerifyCommand {
  async execute(filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);

    if (!existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }

    if (!path.basename(resolved).endsWith(".example.ts")) {
      throw new Error(`File must end in .example.ts — got: ${path.basename(resolved)}`);
    }

    const source = readFileSync(resolved, "utf8");
    this.checkFrontmatter(resolved, source);
    await this.checkWorkflowShape(resolved);

    process.stdout.write(`[example:verify] OK — ${path.basename(resolved)}\n`);
  }

  private checkFrontmatter(filePath: string, source: string): void {
    const missing: string[] = [];
    if (!/@description\s+\S/.test(source)) missing.push("@description");
    if (!/@tags\s+\S/.test(source)) missing.push("@tags");
    if (missing.length > 0) {
      throw new Error(
        `${path.basename(filePath)}: missing required JSDoc frontmatter tag(s): ${missing.join(", ")}. ` +
          `Add them in a /** ... */ block before the export default line.`,
      );
    }
  }

  private async checkWorkflowShape(filePath: string): Promise<void> {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(filePath)) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`${path.basename(filePath)}: import failed`, { cause: error });
    }

    const defaultExport = mod.default ?? mod["workflow"];
    if (!this.isWorkflowDefinition(defaultExport)) {
      const got =
        typeof defaultExport === "object" && defaultExport !== null
          ? `object with keys: ${JSON.stringify(Object.keys(defaultExport))}`
          : typeof defaultExport;
      throw new Error(
        `${path.basename(filePath)}: default export must be a WorkflowDefinition ` +
          `(object with id, name, nodes, edges properties). Got: ${got}. ` +
          `Make sure to call .build() at the end of the workflow chain.`,
      );
    }
  }

  private isWorkflowDefinition(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    return "id" in value && "name" in value && "nodes" in value && "edges" in value;
  }
}
