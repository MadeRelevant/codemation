import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import type { CredentialMetadata } from "./PackageMetadata.types.js";

/**
 * Reads credential type definitions from a package's source tree.
 *
 * Detects `defineCredential({...})` calls and extracts:
 *   - key (used as `name`)
 *   - description
 *   - public + secret field maps → `fields[]`
 */
export class CredentialMetadataReader {
  read(srcDir: string): CredentialMetadata[] {
    const credentials: CredentialMetadata[] = [];
    this.walkTs(srcDir, (filePath) => {
      const text = fs.readFileSync(filePath, "utf8");
      if (!text.includes("defineCredential")) return;
      const found = this.extractFromFile(filePath, text);
      credentials.push(...found);
    });
    return credentials;
  }

  private walkTs(dir: string, visitor: (filePath: string) => void): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkTs(full, visitor);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        visitor(full);
      }
    }
  }

  private extractFromFile(filePath: string, sourceText: string): CredentialMetadata[] {
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const results: CredentialMetadata[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        const callee = ts.isIdentifier(expr) ? expr.text : "";
        if (callee === "defineCredential" && node.arguments.length > 0) {
          const arg = node.arguments[0];
          if (ts.isObjectLiteralExpression(arg)) {
            const cred = this.extractCredentialFromObject(arg);
            if (cred) results.push(cred);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return results;
  }

  private extractCredentialFromObject(obj: ts.ObjectLiteralExpression): CredentialMetadata | null {
    const props = this.collectStringProps(obj);
    const name = props["key"] ?? "";
    if (!name) return null;
    const description = props["description"] ?? props["label"] ?? "";

    const fields: { key: string; type: string; required: boolean }[] = [];

    // Extract from public/secret property object literals
    for (const section of ["public", "secret"]) {
      const sectionProp = obj.properties.find(
        (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === section,
      ) as ts.PropertyAssignment | undefined;

      if (sectionProp && ts.isObjectLiteralExpression(sectionProp.initializer)) {
        for (const fieldProp of sectionProp.initializer.properties) {
          if (!ts.isPropertyAssignment(fieldProp)) continue;
          if (!ts.isIdentifier(fieldProp.name)) continue;
          const fieldKey = fieldProp.name.text;
          const { type, required } = this.extractFieldTypeAndRequired(fieldProp.initializer);
          fields.push({ key: fieldKey, type, required });
        }
      }
    }

    return { name, description, fields };
  }

  private extractFieldTypeAndRequired(node: ts.Expression): { type: string; required: boolean } {
    // Handle `"password" as const` (AsExpression wrapping StringLiteral)
    const unwrapped = ts.isAsExpression(node) ? node.expression : node;
    // String literal shorthand: "string" | "password" | etc.
    if (ts.isStringLiteral(unwrapped)) {
      return { type: unwrapped.text, required: true };
    }
    // Object literal: { key, type, required, ... }
    if (ts.isObjectLiteralExpression(unwrapped)) {
      const requiredProp = unwrapped.properties.find(
        (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "required",
      ) as ts.PropertyAssignment | undefined;
      let required = true;
      if (requiredProp) {
        required = requiredProp.initializer.kind === ts.SyntaxKind.TrueKeyword;
      }
      // For type field, also handle `"password" as const`
      const typeProp = unwrapped.properties.find(
        (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "type",
      ) as ts.PropertyAssignment | undefined;
      let type = "string";
      if (typeProp) {
        const typeVal = ts.isAsExpression(typeProp.initializer)
          ? typeProp.initializer.expression
          : typeProp.initializer;
        if (ts.isStringLiteral(typeVal)) {
          type = typeVal.text;
        }
      }
      return { type, required };
    }
    return { type: "string", required: true };
  }

  /** Extract string-valued properties from an object literal. */
  private collectStringProps(obj: ts.ObjectLiteralExpression): Record<string, string> {
    const result: Record<string, string> = {};
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name)) continue;
      if (ts.isStringLiteral(prop.initializer)) {
        result[prop.name.text] = prop.initializer.text;
      }
    }
    return result;
  }
}
