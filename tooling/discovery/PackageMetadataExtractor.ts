import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { CredentialMetadataReader } from "./CredentialMetadataReader.js";
import { ExampleFrontmatterParser } from "./ExampleFrontmatterParser.js";
import type {
  CredentialMetadata,
  ExampleMetadata,
  NodeMetadata,
  PackageMetadata,
  PackageMetadataOverride,
} from "./PackageMetadata.types.js";

/**
 * Extracts `PackageMetadata` from a package root directory at build time.
 *
 * Reads:
 *   - `package.json` for name/version/description
 *   - `src/` for `@nodeMetadata` decorators and `defineNode(...)` calls
 *   - `src/examples/*.example.ts` for example JSDoc frontmatter
 *   - `codemation.metadata.ts` (if present) for explicit overrides (D3)
 *   - credential type definitions via `CredentialMetadataReader`
 */
export class PackageMetadataExtractor {
  private readonly credentialReader = new CredentialMetadataReader();
  private readonly frontmatterParser = new ExampleFrontmatterParser();

  extract(packageRoot: string): PackageMetadata {
    const pkgJson = this.readPackageJson(packageRoot);
    const override = this.readOverride(packageRoot);
    const srcDir = path.join(packageRoot, "src");

    const nodes = override.nodes ?? this.extractNodes(srcDir);
    const credentials = override.credentials ?? this.credentialReader.read(srcDir);
    const examples = override.examples ?? this.extractExamples(srcDir, pkgJson.dependencies ?? {});

    const kind = this.determineKind(nodes, examples);

    const metadata: PackageMetadata = {
      schemaVersion: 1,
      packageName: pkgJson.name,
      packageVersion: pkgJson.version,
      description: pkgJson.description ?? "",
      kind,
    };

    if (nodes.length > 0) metadata.nodes = nodes;
    if (credentials.length > 0) metadata.credentials = credentials;
    if (examples.length > 0) metadata.examples = examples;

    return metadata;
  }

  private readPackageJson(packageRoot: string): {
    name: string;
    version: string;
    description?: string;
    dependencies?: Record<string, string>;
  } {
    const pkgPath = path.join(packageRoot, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    return JSON.parse(raw) as {
      name: string;
      version: string;
      description?: string;
      dependencies?: Record<string, string>;
    };
  }

  private readOverride(packageRoot: string): PackageMetadataOverride {
    const overridePath = path.join(packageRoot, "codemation.metadata.json");
    if (fs.existsSync(overridePath)) {
      const raw = fs.readFileSync(overridePath, "utf8");
      return JSON.parse(raw) as PackageMetadataOverride;
    }
    return {};
  }

  private determineKind(nodes: NodeMetadata[], examples: ExampleMetadata[]): "nodes" | "examples" | "mixed" {
    const hasNodes = nodes.length > 0;
    const hasExamples = examples.length > 0;
    if (hasNodes && hasExamples) return "mixed";
    if (hasExamples) return "examples";
    return "nodes";
  }

  // ── Node extraction ─────────────────────────────────────────────────────────

  private extractNodes(srcDir: string): NodeMetadata[] {
    const nodes: NodeMetadata[] = [];
    if (!fs.existsSync(srcDir)) return nodes;

    this.walkTs(srcDir, (filePath) => {
      const text = fs.readFileSync(filePath, "utf8");
      const hasDecorator = text.includes("@nodeMetadata") || text.includes("nodeMetadata(");
      const hasDefineNode = text.includes("defineNode(");
      if (!hasDecorator && !hasDefineNode) return;

      const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
      const relPath = path.relative(path.dirname(srcDir), filePath);

      if (hasDecorator) {
        nodes.push(...this.extractDecoratorNodes(sourceFile, relPath));
      }
      if (hasDefineNode) {
        nodes.push(...this.extractDefineNodes(sourceFile, relPath));
      }
    });

    return nodes;
  }

  private extractDecoratorNodes(sourceFile: ts.SourceFile, relPath: string): NodeMetadata[] {
    const results: NodeMetadata[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.modifiers) {
        for (const modifier of node.modifiers) {
          if (!ts.isDecorator(modifier)) continue;
          if (!ts.isCallExpression(modifier.expression)) continue;
          const expr = modifier.expression.expression;
          const callee = ts.isIdentifier(expr) ? expr.text : "";
          if (callee !== "nodeMetadata") continue;

          const arg = modifier.expression.arguments[0];
          if (!ts.isObjectLiteralExpression(arg)) continue;

          const metadata = this.extractNodeMetadataFromDecorator(arg, node, relPath);
          if (metadata) results.push(metadata);
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return results;
  }

  private extractNodeMetadataFromDecorator(
    decoratorArg: ts.ObjectLiteralExpression,
    classNode: ts.ClassDeclaration,
    relPath: string,
  ): NodeMetadata | null {
    const stringProps = this.collectStringProps(decoratorArg);
    const name = stringProps["name"];
    if (!name) return null;

    const description = stringProps["description"] ?? "";

    // Determine kind from class members (has 'trigger' kind literal)
    const nodeKind = this.extractNodeKind(classNode);

    // Extract ports from decorator ports object or class declaredOutputPorts
    const outputPorts = this.extractOutputPortsFromDecorator(decoratorArg) ??
      this.extractDeclaredOutputPorts(classNode) ?? ["main"];
    const inputPorts = ["main"];

    // Tags from decorator
    const tags = this.extractArrayOfStrings(decoratorArg, "tags");

    return {
      name,
      kind: nodeKind,
      description,
      inputPorts,
      outputPorts,
      sourcePath: relPath,
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  private extractDefineNodes(sourceFile: ts.SourceFile, relPath: string): NodeMetadata[] {
    const results: NodeMetadata[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        const callee = ts.isIdentifier(expr) ? expr.text : "";
        if (callee === "defineNode" && node.arguments.length > 0) {
          const arg = node.arguments[0];
          if (ts.isObjectLiteralExpression(arg)) {
            const metadata = this.extractNodeMetadataFromDefineNode(arg, relPath);
            if (metadata) results.push(metadata);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return results;
  }

  private extractNodeMetadataFromDefineNode(arg: ts.ObjectLiteralExpression, relPath: string): NodeMetadata | null {
    const stringProps = this.collectStringProps(arg);
    const name = stringProps["title"] ?? stringProps["key"];
    if (!name) return null;

    const description = stringProps["description"] ?? "";
    const credentialRefs = this.extractCredentialRefsFromDefineNode(arg);

    return {
      name,
      kind: "node",
      description,
      inputPorts: ["main"],
      outputPorts: ["main"],
      credentialRefs: credentialRefs.length > 0 ? credentialRefs : undefined,
      sourcePath: relPath,
    };
  }

  private extractCredentialRefsFromDefineNode(obj: ts.ObjectLiteralExpression): string[] {
    const refs: string[] = [];
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name) || prop.name.text !== "credentials") continue;
      if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
      for (const credProp of prop.initializer.properties) {
        if (!ts.isPropertyAssignment(credProp)) continue;
        if (!ts.isObjectLiteralExpression(credProp.initializer)) continue;
        // Look for type.key or type.definition.typeId
        const innerStringProps = this.collectStringProps(credProp.initializer);
        // The credential object has `type` which is a credential type object with a .key
        // We look for identifier references to find the credential type name
        const typeProp = credProp.initializer.properties.find(
          (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "type",
        ) as ts.PropertyAssignment | undefined;
        if (typeProp) {
          // Extract the identifier name of the credential type variable
          const typeExpr = typeProp.initializer;
          // Handle `expr as Type` (type assertion)
          const base = ts.isAsExpression(typeExpr) ? typeExpr.expression : typeExpr;
          if (ts.isIdentifier(base)) {
            refs.push(base.text);
          } else if (ts.isPropertyAccessExpression(base) && ts.isIdentifier(base.name)) {
            refs.push(base.name.text);
          }
        }
        // Fallback: collect any string key
        if (innerStringProps["key"]) {
          refs.push(innerStringProps["key"]);
        }
      }
    }
    return [...new Set(refs)];
  }

  private extractNodeKind(classNode: ts.ClassDeclaration): "node" | "trigger" {
    for (const member of classNode.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!ts.isIdentifier(member.name) || member.name.text !== "kind") continue;
      if (member.initializer) {
        // Handle `"trigger" as const` (AsExpression wrapping StringLiteral)
        const expr = ts.isAsExpression(member.initializer) ? member.initializer.expression : member.initializer;
        if (ts.isStringLiteral(expr) && expr.text === "trigger") return "trigger";
      }
    }
    return "node";
  }

  private extractOutputPortsFromDecorator(decoratorArg: ts.ObjectLiteralExpression): string[] | null {
    for (const prop of decoratorArg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name) || prop.name.text !== "ports") continue;
      if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
      const keys = prop.initializer.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => (ts.isIdentifier(p.name) ? p.name.text : ts.isStringLiteral(p.name) ? p.name.text : ""))
        .filter(Boolean);
      return keys.length > 0 ? keys : null;
    }
    return null;
  }

  private extractDeclaredOutputPorts(classNode: ts.ClassDeclaration): string[] | null {
    for (const member of classNode.members) {
      if (!ts.isPropertyDeclaration(member)) continue;
      if (!ts.isIdentifier(member.name) || member.name.text !== "declaredOutputPorts") continue;
      if (!member.initializer) continue;
      // Handle `["a", "b"] as const` (AsExpression wrapping ArrayLiteralExpression)
      const expr = ts.isAsExpression(member.initializer) ? member.initializer.expression : member.initializer;
      if (ts.isArrayLiteralExpression(expr)) {
        const ports = expr.elements.filter(ts.isStringLiteral).map((s) => s.text);
        if (ports.length > 0) return ports;
      }
    }
    return null;
  }

  private extractArrayOfStrings(obj: ts.ObjectLiteralExpression, propName: string): string[] {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name) || prop.name.text !== propName) continue;
      if (ts.isArrayLiteralExpression(prop.initializer)) {
        return prop.initializer.elements.filter(ts.isStringLiteral).map((s) => s.text);
      }
    }
    return [];
  }

  // ── Example extraction ───────────────────────────────────────────────────────

  private extractExamples(srcDir: string, packageDeps: Record<string, string>): ExampleMetadata[] {
    const examplesDir = path.join(srcDir, "examples");
    if (!fs.existsSync(examplesDir)) return [];

    const examples: ExampleMetadata[] = [];
    this.walkExampleFiles(examplesDir, (filePath) => {
      const text = fs.readFileSync(filePath, "utf8");
      // Compute relative path from the package root (parent of srcDir), preserving subdirs.
      const relPath = path.relative(path.dirname(srcDir), filePath);
      examples.push(this.frontmatterParser.parse(relPath, text, packageDeps));
    });
    return examples;
  }

  private walkExampleFiles(dir: string, visitor: (filePath: string) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkExampleFiles(full, visitor);
      } else if (entry.isFile() && entry.name.endsWith(".example.ts") && !entry.name.endsWith(".skip")) {
        visitor(full);
      }
    }
  }

  // ── Shared utilities ─────────────────────────────────────────────────────────

  private walkTs(dir: string, visitor: (filePath: string) => void): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkTs(full, visitor);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        visitor(full);
      }
    }
  }

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
