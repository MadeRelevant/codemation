import * as path from "node:path";
import * as ts from "typescript";
import type { ExampleMetadata } from "./PackageMetadata.types.js";

/**
 * Parses JSDoc frontmatter from `.example.ts` files into `ExampleMetadata` chunks.
 *
 * Expected JSDoc tags:
 *   @description  Free-form description (first paragraph if omitted).
 *   @tags         Comma-separated list of tags.
 *   @uses         Package names the example depends on (comma-separated).
 *   @dependencies Additional package pins in `name@version` form (comma-separated).
 */
export class ExampleFrontmatterParser {
  parse(filePath: string, sourceText: string, packageDeps: Record<string, string>): ExampleMetadata {
    const name = path.basename(filePath, ".example.ts");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

    const { description, tags, uses } = this.extractJsDocFrontmatter(sourceFile, sourceText);
    const dependencies = this.resolveDependencies(uses, packageDeps);

    return {
      name,
      description,
      tags,
      sourcePath: filePath,
      dependencies,
      code: sourceText,
    };
  }

  private extractJsDocFrontmatter(
    sourceFile: ts.SourceFile,
    sourceText: string,
  ): {
    description: string;
    tags: string[];
    uses: string[];
  } {
    let description = "";
    const tags: string[] = [];
    const uses: string[] = [];

    // Walk top-level statements looking for JSDoc on the first node
    for (const statement of sourceFile.statements) {
      // Use raw source text for the JSDoc block to handle @-prefixed package names
      // (TypeScript's JSDoc parser splits on @ which breaks @scope/package values)
      const jsDocNodes = (statement as unknown as { jsDoc?: ts.JSDoc[] }).jsDoc;
      if (jsDocNodes && jsDocNodes.length > 0) {
        const jsDoc = jsDocNodes[0];
        const rawBlock = sourceText.substring(jsDoc.getFullStart(), jsDoc.getEnd());
        return this.parseRawJsDoc(rawBlock);
      }

      // Fallback: use TS parsed JSDoc (works when no @scope/package tags present)
      const jsDocs = ts.getJSDocCommentsAndTags(statement);
      for (const jsDoc of jsDocs) {
        if (!ts.isJSDoc(jsDoc)) continue;
        if (jsDoc.comment && !description) {
          description = this.extractText(jsDoc.comment).trim();
        }
        if (jsDoc.tags) {
          for (const tag of jsDoc.tags) {
            const tagName = tag.tagName.text.toLowerCase();
            const tagText = this.extractText(tag.comment).trim();
            if (tagName === "description" && !description) {
              description = tagText;
            } else if (tagName === "tags") {
              tags.push(...this.splitComma(tagText));
            } else if (tagName === "uses") {
              uses.push(...this.splitComma(tagText));
            }
          }
        }
      }
      break;
    }

    return { description, tags, uses };
  }

  /**
   * Parse a raw JSDoc block `/** ... *\/` using simple line-by-line analysis.
   * This avoids the TypeScript JSDoc parser's habit of splitting on `@` characters
   * that appear inside tag values (e.g. `@uses @codemation/core-nodes`).
   */
  private parseRawJsDoc(rawBlock: string): { description: string; tags: string[]; uses: string[] } {
    const lines = rawBlock
      .replace(/^\/\*\*/, "")
      .replace(/\*\/$/, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd());

    let description = "";
    const tags: string[] = [];
    const uses: string[] = [];

    for (const line of lines) {
      const tagMatch = /^@(\w+)\s+(.+)$/.exec(line);
      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();
        const tagValue = tagMatch[2].trim();
        if (tagName === "description" && !description) {
          description = tagValue;
        } else if (tagName === "tags") {
          tags.push(...this.splitComma(tagValue));
        } else if (tagName === "uses") {
          uses.push(...this.splitComma(tagValue));
        }
      } else if (!line.startsWith("@") && !description && line.trim()) {
        description = line.trim();
      }
    }

    return { description, tags, uses };
  }

  private extractText(comment: string | ts.NodeArray<ts.JSDocComment> | undefined): string {
    if (!comment) return "";
    if (typeof comment === "string") return comment;
    return comment.map((c) => (ts.isJSDocText(c) ? c.text : "")).join("");
  }

  private splitComma(text: string): string[] {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private resolveDependencies(uses: string[], packageDeps: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pkg of uses) {
      const version = packageDeps[pkg];
      if (version) {
        result[pkg] = version;
      }
    }
    return result;
  }
}
