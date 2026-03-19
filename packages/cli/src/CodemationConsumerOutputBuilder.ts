import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import { CodemationConsumerConfigLoader } from "@codemation/frontend/consumer";
import type { CodemationConsumerConfigResolution } from "@codemation/frontend/consumer";
import ts from "typescript";

export type CodemationConsumerOutputBuildSnapshot = Readonly<{
  buildVersion: string;
  configSourcePath: string | null;
  consumerRoot: string;
  outputEntryPath: string;
  outputRoot: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

export class CodemationConsumerOutputBuilder {
  private static readonly ignoredDirectoryNames = new Set([".codemation", ".git", "dist", "node_modules"]);
  private static readonly supportedSourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

  private readonly configLoader = new CodemationConsumerConfigLoader();
  private activeBuildPromise: Promise<CodemationConsumerOutputBuildSnapshot> | null = null;
  private watcher: FSWatcher | null = null;

  constructor(private readonly consumerRoot: string) {}

  async ensureBuilt(): Promise<CodemationConsumerOutputBuildSnapshot> {
    if (!this.activeBuildPromise) {
      this.activeBuildPromise = this.buildInternal();
    }
    return await this.activeBuildPromise;
  }

  async ensureWatching(args: Readonly<{ onBuildCompleted: (snapshot: CodemationConsumerOutputBuildSnapshot) => Promise<void> }>): Promise<void> {
    if (this.watcher) {
      return;
    }
    this.watcher = watch([this.consumerRoot], {
      ignoreInitial: true,
      ignored: this.createIgnoredMatcher(),
    });
    this.watcher.on("all", async () => {
      try {
        this.activeBuildPromise = this.buildInternal();
        await args.onBuildCompleted(await this.activeBuildPromise);
      } catch (error) {
        console.error("[codemation-cli] consumer output rebuild failed", error);
      }
    });
  }

  private async buildInternal(): Promise<CodemationConsumerOutputBuildSnapshot> {
    const configResolution = await this.configLoader.load({
      consumerRoot: this.consumerRoot,
    });
    const runtimeSourcePaths = await this.collectRuntimeSourcePaths();
    const outputRoot = this.resolveOutputRoot();
    const outputAppRoot = path.resolve(outputRoot, "app");
    await rm(outputRoot, { force: true, recursive: true });
    for (const sourcePath of runtimeSourcePaths) {
      await this.emitSourceFile({
        outputAppRoot,
        sourcePath,
      });
    }
    const snapshot: CodemationConsumerOutputBuildSnapshot = {
      buildVersion: String(Date.now()),
      configSourcePath: configResolution.bootstrapSource,
      consumerRoot: this.consumerRoot,
      outputEntryPath: path.resolve(outputRoot, "index.js"),
      outputRoot,
      workflowSourcePaths: configResolution.workflowSources,
    };
    await this.writeEntryFile({
      configResolution,
      outputAppRoot,
      snapshot,
    });
    return snapshot;
  }

  private async collectRuntimeSourcePaths(): Promise<ReadonlyArray<string>> {
    const sourcePaths: string[] = [];
    await this.collectSourcePathsRecursively(this.consumerRoot, sourcePaths);
    return sourcePaths
      .filter((sourcePath: string) => this.shouldEmitSourcePath(sourcePath))
      .sort((left: string, right: string) => left.localeCompare(right));
  }

  private async collectSourcePathsRecursively(directoryPath: string, sourcePaths: string[]): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        if (CodemationConsumerOutputBuilder.ignoredDirectoryNames.has(entry.name)) {
          continue;
        }
        await this.collectSourcePathsRecursively(entryPath, sourcePaths);
        continue;
      }
      sourcePaths.push(entryPath);
    }
  }

  private shouldEmitSourcePath(sourcePath: string): boolean {
    if (sourcePath.endsWith(".d.ts")) {
      return false;
    }
    const extension = path.extname(sourcePath);
    if (!CodemationConsumerOutputBuilder.supportedSourceExtensions.has(extension)) {
      return false;
    }
    const relativePath = this.toConsumerRelativePath(sourcePath);
    if (relativePath === "src/main.tsx" || relativePath === "src/server.ts" || relativePath === "vite.config.ts") {
      return false;
    }
    return true;
  }

  private async emitSourceFile(args: Readonly<{ outputAppRoot: string; sourcePath: string }>): Promise<void> {
    const sourceText = await readFile(args.sourcePath, "utf8");
    const transpiledOutput = ts.transpileModule(sourceText, {
      compilerOptions: this.createCompilerOptions(),
      fileName: args.sourcePath,
      reportDiagnostics: false,
    });
    const rewrittenOutputText = await this.rewriteRelativeImportSpecifiers(args.sourcePath, transpiledOutput.outputText);
    const outputPath = this.resolveOutputPath(args.outputAppRoot, args.sourcePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rewrittenOutputText, "utf8");
    if (transpiledOutput.sourceMapText) {
      await writeFile(`${outputPath}.map`, transpiledOutput.sourceMapText, "utf8");
    }
  }

  private createCompilerOptions(): ts.CompilerOptions {
    return {
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      inlineSources: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      sourceMap: true,
      target: ts.ScriptTarget.ES2022,
      useDefineForClassFields: false,
    };
  }

  private async writeEntryFile(args: Readonly<{
    configResolution: CodemationConsumerConfigResolution;
    outputAppRoot: string;
    snapshot: CodemationConsumerOutputBuildSnapshot;
  }>): Promise<void> {
    const configImportPath = this.resolveOutputImportPath(args.outputAppRoot, args.configResolution.bootstrapSource);
    if (!configImportPath) {
      throw new Error("Consumer output build requires a resolved codemation config source.");
    }
    const workflowImportBlocks = args.snapshot.workflowSourcePaths
      .map((workflowSourcePath: string, index: number) => {
        const importPath = this.resolveOutputImportPath(args.outputAppRoot, workflowSourcePath);
        if (!importPath) {
          throw new Error(`Could not resolve workflow output path: ${workflowSourcePath}`);
        }
        return `import * as workflowModule${index} from "${importPath}";`;
      })
      .join("\n");
    const workflowModulesExpression =
      args.snapshot.workflowSourcePaths.length > 0
        ? `[${args.snapshot.workflowSourcePaths.map((_: string, index: number) => `workflowModule${index}`).join(", ")}]`
        : "[]";
    const workflowSourcePathsExpression =
      args.snapshot.workflowSourcePaths.length > 0
        ? `[${args.snapshot.workflowSourcePaths.map((workflowSourcePath: string) => JSON.stringify(workflowSourcePath)).join(", ")}]`
        : "[]";
    const outputText = [
      `import * as configModule from "${configImportPath}";`,
      workflowImportBlocks,
      "const resolver = {",
      "  resolve({ configModule, workflowModules, workflowSourcePaths }) {",
      "    const config = this.resolveConfig(configModule);",
      '    if (!config) throw new Error("Consumer app module does not export a Codemation config object.");',
      "    if (config.workflows !== undefined) {",
      "      return { config, workflowSources: [] };",
      "    }",
      "    return {",
      "      config: { ...config, workflows: this.resolveWorkflows(workflowModules, workflowSourcePaths) },",
      "      workflowSources: workflowSourcePaths,",
      "    };",
      "  },",
      "  resolveConfig(moduleExports) {",
      "    const defaultExport = moduleExports.default;",
      "    if (this.isConfig(defaultExport)) return defaultExport;",
      "    const namedConfig = moduleExports.codemationHost ?? moduleExports.config;",
      "    if (this.isConfig(namedConfig)) return namedConfig;",
      "    return null;",
      "  },",
      "  isConfig(value) {",
      "    if (!value || typeof value !== 'object') return false;",
      "    return 'runtime' in value || 'workflows' in value || 'workflowDiscovery' in value || 'bindings' in value || 'plugins' in value || 'bootHook' in value || 'slots' in value;",
      "  },",
      "  resolveWorkflows(workflowModules, workflowSourcePaths) {",
      "    const workflowsById = new Map();",
      "    workflowModules.forEach((workflowModule, index) => {",
      "      const workflowSourcePath = workflowSourcePaths[index] ?? `workflow-module-${index}`;",
      "      const workflows = this.resolveWorkflowModuleExports(workflowModule, workflowSourcePath);",
      "      workflows.forEach((workflow) => workflowsById.set(workflow.id, workflow));",
      "    });",
      "    return [...workflowsById.values()];",
      "  },",
      "  resolveWorkflowModuleExports(moduleExports, workflowSourcePath) {",
      "    const workflows = Object.values(moduleExports).filter((value) => this.isWorkflowDefinition(value));",
      "    if (workflows.length === 0) {",
      "      throw new Error(`Workflow module does not export a workflow definition: ${workflowSourcePath}`);",
      "    }",
      "    return workflows;",
      "  },",
      "  isWorkflowDefinition(value) {",
      "    if (!value || typeof value !== 'object') return false;",
      "    return 'edges' in value && 'id' in value && 'name' in value && 'nodes' in value;",
      "  },",
      "};",
      `export const codemationConsumerBuildVersion = ${JSON.stringify(args.snapshot.buildVersion)};`,
      `export const codemationConsumerApp = resolver.resolve({`,
      "  configModule,",
      `  workflowModules: ${workflowModulesExpression},`,
      `  workflowSourcePaths: ${workflowSourcePathsExpression},`,
      "});",
      "export default codemationConsumerApp;",
      "",
    ]
      .filter((line: string) => line.length > 0)
      .join("\n");
    await writeFile(args.snapshot.outputEntryPath, outputText, "utf8");
  }

  private async rewriteRelativeImportSpecifiers(sourcePath: string, outputText: string): Promise<string> {
    let nextOutputText = await this.rewritePatternMatches(sourcePath, outputText, /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g);
    nextOutputText = await this.rewritePatternMatches(sourcePath, nextOutputText, /(import\s+["'])(\.{1,2}\/[^"']+)(["'])/g);
    nextOutputText = await this.rewritePatternMatches(sourcePath, nextOutputText, /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g);
    return nextOutputText;
  }

  private async rewritePatternMatches(sourcePath: string, outputText: string, pattern: RegExp): Promise<string> {
    const matches = [...outputText.matchAll(pattern)];
    let rewrittenText = outputText;
    for (const match of matches) {
      const currentSpecifier = match[2];
      const nextSpecifier = await this.resolveRelativeRuntimeSpecifier(sourcePath, currentSpecifier);
      if (nextSpecifier === currentSpecifier) {
        continue;
      }
      rewrittenText = rewrittenText.replace(`${match[1]}${currentSpecifier}${match[3]}`, `${match[1]}${nextSpecifier}${match[3]}`);
    }
    return rewrittenText;
  }

  private async resolveRelativeRuntimeSpecifier(sourcePath: string, importSpecifier: string): Promise<string> {
    if (!importSpecifier.startsWith(".")) {
      return importSpecifier;
    }
    const extension = path.extname(importSpecifier);
    if (this.isRuntimeExtension(extension)) {
      return importSpecifier;
    }
    if (this.isSourceExtension(extension)) {
      return `${importSpecifier.slice(0, importSpecifier.length - extension.length)}${this.toJavascriptExtension(extension)}`;
    }
    const resolvedSpecifier = await this.resolveFileImportSpecifier(sourcePath, importSpecifier);
    if (resolvedSpecifier) {
      return resolvedSpecifier;
    }
    const resolvedIndexSpecifier = await this.resolveIndexImportSpecifier(sourcePath, importSpecifier);
    return resolvedIndexSpecifier ?? importSpecifier;
  }

  private async resolveFileImportSpecifier(sourcePath: string, importSpecifier: string): Promise<string | null> {
    const resolvedBasePath = path.resolve(path.dirname(sourcePath), importSpecifier);
    for (const sourceExtension of CodemationConsumerOutputBuilder.supportedSourceExtensions) {
      if (await this.fileExists(`${resolvedBasePath}${sourceExtension}`)) {
        return `${importSpecifier}${this.toJavascriptExtension(sourceExtension)}`;
      }
    }
    return null;
  }

  private async resolveIndexImportSpecifier(sourcePath: string, importSpecifier: string): Promise<string | null> {
    const resolvedDirectoryPath = path.resolve(path.dirname(sourcePath), importSpecifier);
    for (const sourceExtension of CodemationConsumerOutputBuilder.supportedSourceExtensions) {
      const indexSourcePath = path.resolve(resolvedDirectoryPath, `index${sourceExtension}`);
      if (await this.fileExists(indexSourcePath)) {
        return `${importSpecifier}/index${this.toJavascriptExtension(sourceExtension)}`;
      }
    }
    return null;
  }

  private resolveOutputImportPath(outputAppRoot: string, sourcePath: string | null): string | null {
    if (!sourcePath) {
      return null;
    }
    const outputPath = this.resolveOutputPath(outputAppRoot, sourcePath);
    const relativePath = path.relative(path.dirname(this.resolveOutputEntryPath()), outputPath).replace(/\\/g, "/");
    return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
  }

  private resolveOutputPath(outputAppRoot: string, sourcePath: string): string {
    const relativePath = this.toConsumerRelativePath(sourcePath);
    const nextExtension = this.toJavascriptExtension(path.extname(relativePath));
    const pathWithoutExtension = relativePath.slice(0, relativePath.length - path.extname(relativePath).length);
    return path.resolve(outputAppRoot, `${pathWithoutExtension}${nextExtension}`);
  }

  private resolveOutputRoot(): string {
    return path.resolve(this.consumerRoot, ".codemation", "output");
  }

  private resolveOutputEntryPath(): string {
    return path.resolve(this.resolveOutputRoot(), "index.js");
  }

  private isRuntimeExtension(extension: string): boolean {
    return extension === ".cjs" || extension === ".js" || extension === ".json" || extension === ".mjs";
  }

  private isSourceExtension(extension: string): boolean {
    return CodemationConsumerOutputBuilder.supportedSourceExtensions.has(extension);
  }

  private toJavascriptExtension(extension: string): string {
    if (extension === ".cts") {
      return ".cjs";
    }
    if (extension === ".mts") {
      return ".mjs";
    }
    return ".js";
  }

  private createIgnoredMatcher(): (watchPath: string) => boolean {
    return (watchPath: string): boolean => {
      const relativePath = path.relative(this.consumerRoot, watchPath);
      if (relativePath.startsWith("..")) {
        return false;
      }
      return relativePath
        .replace(/\\/g, "/")
        .split("/")
        .some((segment: string) => CodemationConsumerOutputBuilder.ignoredDirectoryNames.has(segment));
    };
  }

  private toConsumerRelativePath(filePath: string): string {
    return path.relative(this.consumerRoot, filePath);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
