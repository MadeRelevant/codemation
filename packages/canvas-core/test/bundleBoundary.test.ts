/**
 * Bundle-boundary enforcement for @codemation/canvas-core.
 *
 * canvas-core is more restrictive than canvas — it also forbids all next/* imports
 * (canvas is a React component library that may legitimately use next/image etc;
 * canvas-core is pure logic + hooks and must stay framework-agnostic).
 *
 * Forbidden patterns (any import specifier matching):
 *   - next/* (any Next.js module)
 *   - @prisma/*
 *   - hono (and hono/*)
 *   - bcryptjs
 *   - node:* (Node.js built-ins)
 *   - @codemation/host/server
 *   - @codemation/host/persistence
 *
 * Allowed @codemation/host subpaths: /dto, /client, /mapping, /credentials
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(import.meta.dirname, "../src");

const FORBIDDEN_PATTERNS = [
  /^next\//,
  /^next$/,
  /^@prisma\//,
  /^hono(\/|$)/,
  /^bcryptjs$/,
  /^node:/,
  /^@codemation\/host\/server$/,
  /^@codemation\/host\/persistence$/,
];

function isForbidden(specifier: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(specifier));
}

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

function extractImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf-8");
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true);
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    // static import / export … from "…"
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    // dynamic import("…")
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        specifiers.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
  return specifiers;
}

describe("@codemation/canvas-core bundle boundary", () => {
  const files = collectSourceFiles(SRC_ROOT);
  expect(files.length).toBeGreaterThan(0);

  it("no source file imports server-only or Next.js-specific modules", () => {
    const violations: Array<{ file: string; specifier: string }> = [];

    for (const file of files) {
      for (const specifier of extractImportSpecifiers(file)) {
        if (isForbidden(specifier)) {
          violations.push({ file: file.replace(SRC_ROOT + "/", ""), specifier });
        }
      }
    }

    if (violations.length > 0) {
      const message = violations.map((v) => `  ${v.file}: imports "${v.specifier}"`).join("\n");
      expect.fail(`Server-only imports found in @codemation/canvas-core/src:\n${message}`);
    }
  });
});
