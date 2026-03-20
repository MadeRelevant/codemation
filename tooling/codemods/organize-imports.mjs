import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

class OrganizeImportsCli {
  static main() {
    const cli = new OrganizeImportsCli();
    cli.run();
  }

  constructor() {
    this.repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    this.skipDirectoryNames = new Set([
      "node_modules",
      "dist",
      ".next",
      ".turbo",
      ".git",
      "coverage",
      "generated",
      ".cursor",
      ".codemation",
    ]);
    this.scriptVersions = new Map();
    this.fileCache = new Map();
    this.compilerOptions = {
      allowJs: false,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    };
  }

  run() {
    const files = this.collectTargetFiles();
    for (const filePath of files) {
      this.scriptVersions.set(filePath, 0);
      this.fileCache.set(filePath, fs.readFileSync(filePath, "utf8"));
    }

    const host = this.createLanguageServiceHost(files);
    const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

    let changedFiles = 0;
    for (const filePath of files) {
      const changed = this.organizeFile(languageService, filePath);
      if (changed) {
        changedFiles += 1;
        console.log(`organized ${path.relative(this.repoRoot, filePath)}`);
      }
    }

    console.log(`\norganized imports in ${changedFiles} files`);
  }

  collectTargetFiles() {
    const targets = [];
    const roots = [
      path.join(this.repoRoot, "packages"),
      path.join(this.repoRoot, "apps"),
      path.join(this.repoRoot, "tooling"),
    ];

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      this.walkDirectory(root, targets);
    }

    return targets.sort((left, right) => left.localeCompare(right));
  }

  walkDirectory(directoryPath, targets) {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (this.skipDirectoryNames.has(entry.name)) continue;
        this.walkDirectory(absolutePath, targets);
        continue;
      }
      if (!this.shouldIncludeFile(absolutePath)) continue;
      targets.push(absolutePath);
    }
  }

  shouldIncludeFile(filePath) {
    if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return false;
    if (filePath.endsWith(".d.ts")) return false;
    return true;
  }

  createLanguageServiceHost(files) {
    return {
      getCompilationSettings: () => this.compilerOptions,
      getScriptFileNames: () => files,
      getScriptVersion: (fileName) => String(this.scriptVersions.get(fileName) ?? 0),
      getScriptSnapshot: (fileName) => {
        const text = this.readFileText(fileName);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => this.repoRoot,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: (fileName) => fs.existsSync(fileName),
      readFile: (fileName) => this.readFileText(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
  }

  organizeFile(languageService, filePath) {
    const changes = languageService.organizeImports(
      {
        type: "file",
        fileName: filePath,
        skipDestructiveCodeActions: false,
      },
      {},
      {},
    );

    const relevantChanges = changes.filter((change) => path.resolve(change.fileName) === path.resolve(filePath));
    if (relevantChanges.length === 0) return false;

    let nextText = this.readFileText(filePath);
    if (nextText === undefined) return false;

    const textChanges = relevantChanges
      .flatMap((change) => change.textChanges)
      .sort((left, right) => right.span.start - left.span.start);

    for (const change of textChanges) {
      nextText = `${nextText.slice(0, change.span.start)}${change.newText}${nextText.slice(change.span.start + change.span.length)}`;
    }

    const previousText = this.fileCache.get(filePath);
    if (previousText === nextText) return false;

    fs.writeFileSync(filePath, nextText, "utf8");
    this.fileCache.set(filePath, nextText);
    this.scriptVersions.set(filePath, (this.scriptVersions.get(filePath) ?? 0) + 1);
    return true;
  }

  readFileText(fileName) {
    if (this.fileCache.has(fileName)) {
      return this.fileCache.get(fileName);
    }
    if (!fs.existsSync(fileName)) {
      return undefined;
    }
    const text = fs.readFileSync(fileName, "utf8");
    this.fileCache.set(fileName, text);
    return text;
  }
}

OrganizeImportsCli.main();
