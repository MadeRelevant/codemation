/**
 * Splits a source file that declares multiple top-level classes into one file per class.
 * Primary class = name matches basename (e.g. Foo.ts → class Foo), else the first class.
 * Moved classes get new files; the original file re-exports them so imports keep working.
 *
 * Run from repo root: pnpm exec tsx tooling/codemods/split-multi-class-files.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  ".next",
  "coverage",
  "generated",
]);

/** @param {string} filePath */
function shouldSkipFile(filePath) {
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return true;
  if (filePath.endsWith(".d.ts")) return true;
  if (filePath.includes(`${path.sep}test${path.sep}`)) return true;
  if (filePath.includes(".test.ts") || filePath.includes(".test.tsx")) return true;
  if (path.basename(filePath) === "index.ts") return true;
  if (filePath.includes(`${path.sep}infrastructure${path.sep}persistence${path.sep}generated${path.sep}`)) return true;
  return false;
}

/** @param {string} dir */
function* walkSrcFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      yield* walkSrcFiles(p);
    } else if (shouldSkipFile(p)) {
      continue;
    } else {
      yield p;
    }
  }
}

/** @param {ts.SourceFile} sf */
function getTopLevelClasses(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isClassDeclaration(st) && st.name) out.push(st);
  }
  return out;
}

/** @param {ts.Node} node */
function nodeFullText(sf, node) {
  return sf.text.slice(node.getFullStart(), node.getEnd());
}

/** @param {ts.SourceFile} sf */
function importBlockText(sf, skipModuleLiterals) {
  const lines = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const spec = st.moduleSpecifier;
    if (ts.isStringLiteral(spec) && skipModuleLiterals.has(spec.text)) continue;
    lines.push(nodeFullText(sf, st).trimEnd());
  }
  return lines.join("\n");
}

/**
 * @param {string} classBody
 * @param {string} name
 */
function referencesIdentifier(classBody, name) {
  const re = new RegExp(`\\b${name}\\b`);
  return re.test(classBody);
}

function main() {
  const roots = [
    path.join(REPO_ROOT, "packages"),
    path.join(REPO_ROOT, "apps"),
  ];

  let filesChanged = 0;
  let classesMoved = 0;

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const pkg of fs.readdirSync(root, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const srcDir = path.join(root, pkg.name, "src");
      if (!fs.existsSync(srcDir)) continue;

      for (const filePath of walkSrcFiles(srcDir)) {
        const ext = path.extname(filePath);
        const baseNameNoExt = path.basename(filePath, ext);
        const text = fs.readFileSync(filePath, "utf8");
        const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ext === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

        const classes = getTopLevelClasses(sf);
        if (classes.length <= 1) continue;

        const primary =
          classes.find((c) => c.name && c.name.text === baseNameNoExt) ??
          classes.find((c) => c.name && c.name.text === toPascalFromFileBase(baseNameNoExt)) ??
          classes[0];

        const toMove = classes.filter((c) => c !== primary);
        if (toMove.length === 0) continue;

        const primaryName = primary.name?.text ?? "";
        const dir = path.dirname(filePath);
        const skipRelative = new Set([`./${baseNameNoExt}`]);

        /** @type {ts.ClassDeclaration[]} */
        const movedNodes = [];
        const movedNames = [];
        for (const cls of toMove) {
          const className = cls.name.text;
          const targetPath = path.join(dir, `${className}${ext}`);
          if (fs.existsSync(targetPath)) {
            console.warn(`skip ${filePath}: ${targetPath} already exists`);
            continue;
          }

          let body = nodeFullText(sf, cls);
          const trimmed = body.trimStart();
          const needsExport =
            ts.canHaveModifiers(cls) &&
            !cls.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
          if (needsExport && /\bclass\s/.test(trimmed)) {
            body = body.replace(/\b(class|abstract class)\b/, "export $1");
          }

          const extraImports = [];
          if (primaryName && referencesIdentifier(body, primaryName)) {
            extraImports.push(`import { ${primaryName} } from "./${baseNameNoExt}";`);
          }

          const importBlock = importBlockText(sf, skipRelative);
          const newFileParts = [importBlock, extraImports.join("\n"), body].filter(Boolean);
          const newFileContent = `${newFileParts.join("\n\n").trimEnd()}\n`;
          fs.writeFileSync(targetPath, newFileContent, "utf8");
          movedNodes.push(cls);
          movedNames.push(className);
          classesMoved++;

          console.log(`wrote ${path.relative(REPO_ROOT, targetPath)}`);
        }

        if (movedNames.length === 0) continue;

        const removeSet = new Set(movedNodes);
        /** Rebuild original: keep non-moved statements in order */
        const keptPieces = [];
        for (const st of sf.statements) {
          if (ts.isClassDeclaration(st) && st.name && removeSet.has(st)) continue;
          keptPieces.push(nodeFullText(sf, st).trimEnd());
        }

        const reexports = movedNames.map((n) => `export { ${n} } from "./${n}";`).join("\n");
        const newOriginal = `${keptPieces.filter(Boolean).join("\n\n").trimEnd()}\n\n${reexports}\n`;
        fs.writeFileSync(filePath, newOriginal, "utf8");
        filesChanged++;
        console.log(`updated ${path.relative(REPO_ROOT, filePath)} (+ re-exports)`);
      }
    }
  }

  console.log(`\ndone: ${filesChanged} files split, ${classesMoved} classes moved`);
}

/** kebab or snake file base → Pascal try (WorkflowHttpRouteHandler for workflow-http → weak); usually basename already matches */
function toPascalFromFileBase(base) {
  return base
    .split(/[-_]/g)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

main();
