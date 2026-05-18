/**
 * Verify-examples runner.
 *
 * Globs src/examples/*.example.ts, imports each file (smoke check), verifies
 * the export shape (WorkflowDefinition), and runs build:metadata to confirm
 * the extractor produces valid output.
 *
 * Invoked via:
 *   node --import tsx/esm src/verify-examples-script.ts
 */

import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const examplesDir = path.join(packageRoot, "src", "examples");

class VerifyExamplesRunner {
  async run(): Promise<void> {
    const exampleFiles = this.collectExampleFiles();
    process.stdout.write(`[verify-examples] Found ${exampleFiles.length} example file(s).\n`);

    for (const filePath of exampleFiles) {
      await this.verifyFile(filePath);
    }

    this.runBuildMetadata();

    process.stdout.write("[verify-examples] All checks passed.\n");
  }

  private collectExampleFiles(): string[] {
    if (!existsSync(examplesDir)) {
      return [];
    }
    return readdirSync(examplesDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".example.ts") && !entry.name.endsWith(".skip"))
      .map((entry) => path.join(examplesDir, entry.name));
  }

  private async verifyFile(filePath: string): Promise<void> {
    const slug = path.basename(filePath, ".example.ts");
    process.stdout.write(`[verify-examples] Checking ${slug}...\n`);

    let mod: Record<string, unknown>;
    try {
      mod = (await import(filePath)) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`[verify-examples] ${slug}: import failed`, { cause: error });
    }

    const defaultExport = mod.default ?? mod["workflow"];
    if (!this.isWorkflowDefinition(defaultExport)) {
      throw new Error(
        `[verify-examples] ${slug}: default export must be a WorkflowDefinition ` +
          `(object with id, name, nodes, edges). ` +
          `Got: ${typeof defaultExport === "object" && defaultExport !== null ? JSON.stringify(Object.keys(defaultExport)) : typeof defaultExport}`,
      );
    }
  }

  private isWorkflowDefinition(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    return "id" in value && "name" in value && "nodes" in value && "edges" in value;
  }

  private runBuildMetadata(): void {
    process.stdout.write("[verify-examples] Running build:metadata...\n");
    try {
      execSync("pnpm build:metadata", {
        cwd: packageRoot,
        stdio: "inherit",
      });
    } catch (error) {
      throw new Error("[verify-examples] build:metadata failed — check extractor output above.", { cause: error });
    }
  }
}

const runner = new VerifyExamplesRunner();
await runner.run();
