import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import { copyFile,mkdir,readdir,readFile,rm,stat,writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ts from "typescript";

export type CodemationConsumerOutputBuildSnapshot = Readonly<{
  buildVersion: string;
  configSourcePath: string | null;
  consumerRoot: string;
  manifestPath: string;
  outputEntryPath: string;
  outputRoot: string;
  revisionOutputRoot: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

type CodemationBuildConfigMetadata = Readonly<{
  hasInlineWorkflows: boolean;
  workflowDiscoveryDirectories: ReadonlyArray<string>;
}>;

export class CodemationConsumerOutputBuilder {
  private static readonly ignoredDirectoryNames = new Set([".codemation", ".git", "dist", "node_modules"]);
  private static readonly maxRetainedRevisions = 5;
  private static readonly supportedSourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
  private static readonly defaultWorkflowDirectories = ["src/workflows", "workflows"] as const;
  private static readonly watchBuildDebounceMs = 75;

  private activeBuildPromise: Promise<CodemationConsumerOutputBuildSnapshot> | null = null;
  private watcher: FSWatcher | null = null;
  private watchBuildLoopPromise: Promise<void> | null = null;
  private watchBuildDebounceTimeout: NodeJS.Timeout | null = null;
  private hasQueuedWatchEvent = false;
  private hasPendingWatchBuild = false;
  private lastIssuedBuildVersion = 0;

  constructor(private readonly consumerRoot: string) {}

  async ensureBuilt(): Promise<CodemationConsumerOutputBuildSnapshot> {
    if (!this.activeBuildPromise) {
      this.activeBuildPromise = this.buildInternal();
    }
    return await this.activeBuildPromise;
  }

  async ensureWatching(args: Readonly<{
    onBuildStarted?: () => Promise<void>;
    onBuildCompleted: (snapshot: CodemationConsumerOutputBuildSnapshot) => Promise<void>;
    onBuildFailed?: (error: Error) => Promise<void>;
  }>): Promise<void> {
    if (this.watcher) {
      return;
    }
    this.watcher = watch([this.consumerRoot], {
      ignoreInitial: true,
      ignored: this.createIgnoredMatcher(),
    });
    this.watcher.on("all", () => {
      this.scheduleWatchBuild(args);
    });
  }

  private async flushWatchBuilds(args: Readonly<{
    onBuildStarted?: () => Promise<void>;
    onBuildCompleted: (snapshot: CodemationConsumerOutputBuildSnapshot) => Promise<void>;
    onBuildFailed?: (error: Error) => Promise<void>;
  }>): Promise<void> {
    try {
      while (this.hasPendingWatchBuild) {
        this.hasPendingWatchBuild = false;
        if (args.onBuildStarted) {
          await args.onBuildStarted();
        }
        try {
          this.activeBuildPromise = this.buildInternal();
          await args.onBuildCompleted(await this.activeBuildPromise);
        } catch (error) {
          const exception = error instanceof Error ? error : new Error(String(error));
          if (args.onBuildFailed && !this.hasPendingWatchBuild && !this.hasQueuedWatchEvent) {
            await args.onBuildFailed(exception);
          }
          console.error("[codemation-cli] consumer output rebuild failed", exception);
        }
      }
    } finally {
      this.watchBuildLoopPromise = null;
      if (this.hasPendingWatchBuild) {
        this.watchBuildLoopPromise = this.flushWatchBuilds(args);
      }
    }
  }

  private async buildInternal(): Promise<CodemationConsumerOutputBuildSnapshot> {
    const configSourcePath = await this.resolveConfigPath(this.consumerRoot);
    if (!configSourcePath) {
      throw new Error('Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".');
    }
    const runtimeSourcePaths = await this.collectRuntimeSourcePaths();
    const buildVersion = this.createBuildVersion();
    const outputRoot = this.resolveOutputRoot();
    const revisionOutputRoot = this.resolveRevisionOutputRoot(buildVersion);
    const outputAppRoot = path.resolve(revisionOutputRoot, "app");
    for (const sourcePath of runtimeSourcePaths) {
      if (this.shouldCopyAssetPath(sourcePath)) {
        await this.copyAssetFile({
          outputAppRoot,
          sourcePath,
        });
        continue;
      }
      await this.emitSourceFile({
        outputAppRoot,
        sourcePath,
      });
    }
    const outputEntryPath = path.resolve(revisionOutputRoot, "index.js");
    const configMetadata = await this.loadConfigMetadata(configSourcePath);
    const workflowSourcePaths = await this.resolveWorkflowSources(this.consumerRoot, configMetadata);
    const snapshot: CodemationConsumerOutputBuildSnapshot = {
      buildVersion,
      configSourcePath,
      consumerRoot: this.consumerRoot,
      manifestPath: this.resolveCurrentManifestPath(),
      outputEntryPath,
      outputRoot,
      revisionOutputRoot,
      workflowSourcePaths,
    };
    await this.writeEntryFile({
      configSourcePath,
      outputAppRoot,
      snapshot,
    });
    const protectedBuildVersions = await this.resolveProtectedBuildVersions(buildVersion);
    await this.pruneStaleRevisions({
      protectedBuildVersions,
    });
    return snapshot;
  }

  private scheduleWatchBuild(args: Readonly<{
    onBuildStarted?: () => Promise<void>;
    onBuildCompleted: (snapshot: CodemationConsumerOutputBuildSnapshot) => Promise<void>;
    onBuildFailed?: (error: Error) => Promise<void>;
  }>): void {
    this.hasQueuedWatchEvent = true;
    if (this.watchBuildDebounceTimeout) {
      clearTimeout(this.watchBuildDebounceTimeout);
    }
    this.watchBuildDebounceTimeout = setTimeout(() => {
      this.watchBuildDebounceTimeout = null;
      this.hasQueuedWatchEvent = false;
      this.hasPendingWatchBuild = true;
      if (!this.watchBuildLoopPromise) {
        this.watchBuildLoopPromise = this.flushWatchBuilds(args);
      }
    }, CodemationConsumerOutputBuilder.watchBuildDebounceMs);
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
    if (this.shouldCopyAssetPath(sourcePath)) {
      return true;
    }
    if (sourcePath.endsWith(".d.ts")) {
      return false;
    }
    const extension = path.extname(sourcePath);
    return CodemationConsumerOutputBuilder.supportedSourceExtensions.has(extension);
  }

  private shouldCopyAssetPath(sourcePath: string): boolean {
    const fileName = path.basename(sourcePath);
    return fileName === ".env" || fileName.startsWith(".env.");
  }

  private async copyAssetFile(args: Readonly<{ outputAppRoot: string; sourcePath: string }>): Promise<void> {
    const outputPath = path.resolve(args.outputAppRoot, this.toConsumerRelativePath(args.sourcePath));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(args.sourcePath, outputPath);
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
    configSourcePath: string;
    outputAppRoot: string;
    snapshot: CodemationConsumerOutputBuildSnapshot;
  }>): Promise<void> {
    const configImportPath = this.resolveOutputImportPath(
      args.outputAppRoot,
      args.snapshot.outputEntryPath,
      args.configSourcePath,
    );
    if (!configImportPath) {
      throw new Error("Consumer output build requires a resolved codemation config source.");
    }
    const workflowImportBlocks = args.snapshot.workflowSourcePaths
      .map((workflowSourcePath: string, index: number) => {
        const importPath = this.resolveOutputImportPath(args.outputAppRoot, args.snapshot.outputEntryPath, workflowSourcePath);
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

  private resolveOutputImportPath(outputAppRoot: string, outputEntryPath: string, sourcePath: string | null): string | null {
    if (!sourcePath) {
      return null;
    }
    const outputPath = this.resolveOutputPath(outputAppRoot, sourcePath);
    const relativePath = path.relative(path.dirname(outputEntryPath), outputPath).replace(/\\/g, "/");
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

  private resolveRevisionOutputRoot(buildVersion: string): string {
    return path.resolve(this.resolveOutputRoot(), "revisions", buildVersion);
  }

  private resolveCurrentManifestPath(): string {
    return path.resolve(this.resolveOutputRoot(), "current.json");
  }

  private resolveRevisionsRoot(): string {
    return path.resolve(this.resolveOutputRoot(), "revisions");
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

  private createBuildVersion(): string {
    const nextBuildVersion = Math.max(Date.now(), this.lastIssuedBuildVersion + 1);
    this.lastIssuedBuildVersion = nextBuildVersion;
    return String(nextBuildVersion);
  }

  private async resolveConfigPath(consumerRoot: string): Promise<string | null> {
    for (const candidate of this.getConventionCandidates(consumerRoot)) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private getConventionCandidates(consumerRoot: string): ReadonlyArray<string> {
    return [
      path.resolve(consumerRoot, "codemation.config.ts"),
      path.resolve(consumerRoot, "codemation.config.js"),
      path.resolve(consumerRoot, "src", "codemation.config.ts"),
      path.resolve(consumerRoot, "src", "codemation.config.js"),
    ];
  }

  private async loadConfigMetadata(configSourcePath: string): Promise<CodemationBuildConfigMetadata> {
    const sourceText = await readFile(configSourcePath, "utf8");
    const sourceFile = ts.createSourceFile(
      configSourcePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      this.resolveScriptKind(configSourcePath),
    );
    const configObjectLiteral = this.resolveConfigObjectLiteral(sourceFile);
    if (!configObjectLiteral) {
      return {
        hasInlineWorkflows: false,
        workflowDiscoveryDirectories: [...CodemationConsumerOutputBuilder.defaultWorkflowDirectories],
      };
    }
    const workflowDiscovery = this.readObjectLiteralProperty(configObjectLiteral, "workflowDiscovery");
    const workflowDiscoveryDirectories = this.readStringArrayProperty(workflowDiscovery, "directories");
    return {
      hasInlineWorkflows: this.hasProperty(configObjectLiteral, "workflows"),
      workflowDiscoveryDirectories: workflowDiscoveryDirectories.length > 0
        ? workflowDiscoveryDirectories
        : [...CodemationConsumerOutputBuilder.defaultWorkflowDirectories],
    };
  }

  private resolveScriptKind(filePath: string): ts.ScriptKind {
    const extension = path.extname(filePath);
    if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
      return ts.ScriptKind.JS;
    }
    if (extension === ".tsx") {
      return ts.ScriptKind.TSX;
    }
    return ts.ScriptKind.TS;
  }

  private resolveConfigObjectLiteral(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | null {
    const objectLiteralsByIdentifier = new Map<string, ts.ObjectLiteralExpression>();
    const exportedObjectLiterals: ts.ObjectLiteralExpression[] = [];
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) {
        continue;
      }
      const isExported = this.hasExportModifier(statement);
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        const objectLiteral = this.unwrapObjectLiteralExpression(declaration.initializer);
        if (!objectLiteral) {
          continue;
        }
        objectLiteralsByIdentifier.set(declaration.name.text, objectLiteral);
        if (isExported) {
          exportedObjectLiterals.push(objectLiteral);
        }
      }
    }
    for (const statement of sourceFile.statements) {
      if (!ts.isExportAssignment(statement)) {
        continue;
      }
      const directObjectLiteral = this.unwrapObjectLiteralExpression(statement.expression);
      if (directObjectLiteral) {
        return directObjectLiteral;
      }
      if (ts.isIdentifier(statement.expression)) {
        const resolvedObjectLiteral = objectLiteralsByIdentifier.get(statement.expression.text);
        if (resolvedObjectLiteral) {
          return resolvedObjectLiteral;
        }
      }
    }
    const namedConfigLiteral = objectLiteralsByIdentifier.get("codemationHost") ?? objectLiteralsByIdentifier.get("config");
    if (namedConfigLiteral) {
      return namedConfigLiteral;
    }
    return exportedObjectLiterals[0] ?? null;
  }

  private hasExportModifier(statement: ts.Node): boolean {
    return ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement)?.some((modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false)
      : false;
  }

  private unwrapObjectLiteralExpression(node: ts.Expression | undefined): ts.ObjectLiteralExpression | null {
    if (!node) {
      return null;
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node;
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
      return this.unwrapObjectLiteralExpression(node.expression);
    }
    return null;
  }

  private hasProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): boolean {
    return this.getPropertyAssignment(objectLiteral, propertyName) !== null;
  }

  private readObjectLiteralProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): ts.ObjectLiteralExpression | null {
    const property = this.getPropertyAssignment(objectLiteral, propertyName);
    return this.unwrapObjectLiteralExpression(property?.initializer);
  }

  private readStringArrayProperty(objectLiteral: ts.ObjectLiteralExpression | null, propertyName: string): ReadonlyArray<string> {
    if (!objectLiteral) {
      return [];
    }
    const property = this.getPropertyAssignment(objectLiteral, propertyName);
    if (!property || !ts.isArrayLiteralExpression(property.initializer)) {
      return [];
    }
    const values: string[] = [];
    for (const element of property.initializer.elements) {
      if (ts.isStringLiteralLike(element)) {
        values.push(element.text);
      }
    }
    return values;
  }

  private getPropertyAssignment(objectLiteral: ts.ObjectLiteralExpression, propertyName: string): ts.PropertyAssignment | null {
    for (const property of objectLiteral.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const name = this.readPropertyName(property.name);
      if (name === propertyName) {
        return property;
      }
    }
    return null;
  }

  private readPropertyName(propertyName: ts.PropertyName): string | null {
    if (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName)) {
      return propertyName.text;
    }
    return null;
  }

  private async resolveWorkflowSources(consumerRoot: string, configMetadata: CodemationBuildConfigMetadata): Promise<ReadonlyArray<string>> {
    if (configMetadata.hasInlineWorkflows) {
      return [];
    }
    const discoveredPaths = await this.discoverWorkflowModulePaths(consumerRoot, configMetadata.workflowDiscoveryDirectories);
    return [...discoveredPaths].sort((left: string, right: string) => left.localeCompare(right));
  }

  private async discoverWorkflowModulePaths(
    consumerRoot: string,
    workflowDirectories: ReadonlyArray<string> | undefined,
  ): Promise<ReadonlyArray<string>> {
    const directories = workflowDirectories ?? ["src/workflows", "workflows"];
    const workflowModulePaths: string[] = [];
    for (const directory of directories) {
      const absoluteDirectory = path.resolve(consumerRoot, directory);
      if (!(await this.fileExists(absoluteDirectory))) {
        continue;
      }
      workflowModulePaths.push(...(await this.collectWorkflowModulePaths(absoluteDirectory)));
    }
    return workflowModulePaths;
  }

  private async collectWorkflowModulePaths(directoryPath: string): Promise<ReadonlyArray<string>> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const workflowModulePaths: string[] = [];
    for (const entry of entries) {
      const entryPath = path.resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        workflowModulePaths.push(...(await this.collectWorkflowModulePaths(entryPath)));
        continue;
      }
      if (this.isWorkflowModulePath(entryPath)) {
        workflowModulePaths.push(entryPath);
      }
    }
    return workflowModulePaths;
  }

  private isWorkflowModulePath(modulePath: string): boolean {
    const extension = path.extname(modulePath);
    return extension === ".ts" || extension === ".js" || extension === ".mts" || extension === ".mjs";
  }

  private async resolveProtectedBuildVersions(currentBuildVersion: string): Promise<ReadonlySet<string>> {
    const protectedBuildVersions = new Set<string>([currentBuildVersion]);
    const publishedBuildVersion = await this.readPublishedBuildVersion();
    if (publishedBuildVersion) {
      protectedBuildVersions.add(publishedBuildVersion);
    }
    return protectedBuildVersions;
  }

  private async readPublishedBuildVersion(): Promise<string | null> {
    const manifestPath = this.resolveCurrentManifestPath();
    try {
      const manifestText = await readFile(manifestPath, "utf8");
      const parsedManifest = JSON.parse(manifestText) as Readonly<{ buildVersion?: unknown }>;
      return typeof parsedManifest.buildVersion === "string" ? parsedManifest.buildVersion : null;
    } catch {
      return null;
    }
  }

  private async pruneStaleRevisions(args: Readonly<{ protectedBuildVersions: ReadonlySet<string> }>): Promise<void> {
    const revisionsRoot = this.resolveRevisionsRoot();
    const revisionEntries = await this.readRevisionEntries(revisionsRoot);
    const staleRevisions: Array<Readonly<{ name: string }>> = [];
    let retainedNonProtectedRevisionCount = 0;
    for (const revisionEntry of revisionEntries) {
      if (args.protectedBuildVersions.has(revisionEntry.name)) {
        continue;
      }
      if (args.protectedBuildVersions.size + retainedNonProtectedRevisionCount < CodemationConsumerOutputBuilder.maxRetainedRevisions) {
        retainedNonProtectedRevisionCount += 1;
        continue;
      }
      staleRevisions.push(revisionEntry);
    }
    for (const staleRevision of staleRevisions) {
      await this.removeDirectoryRobustly(path.resolve(revisionsRoot, staleRevision.name));
    }
  }

  private async readRevisionEntries(revisionsRoot: string): Promise<ReadonlyArray<Readonly<{ name: string }>>> {
    try {
      const entries = await readdir(revisionsRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: entry.name }))
        .sort((left, right) => this.compareRevisionNamesDescending(left.name, right.name));
    } catch {
      return [];
    }
  }

  private compareRevisionNamesDescending(left: string, right: string): number {
    const leftRevision = Number(left);
    const rightRevision = Number(right);
    if (Number.isFinite(leftRevision) && Number.isFinite(rightRevision)) {
      return rightRevision - leftRevision;
    }
    return right.localeCompare(left);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async removeDirectoryRobustly(directoryPath: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await rm(directoryPath, { force: true, recursive: true });
        return;
      } catch (error) {
        if (!this.isRetryableDirectoryRemovalError(error) || attempt === 2) {
          throw error;
        }
        await delay(25 * (attempt + 1));
      }
    }
  }

  private isRetryableDirectoryRemovalError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const errorWithCode = error as Error & Readonly<{ code?: unknown }>;
    return errorWithCode.code === "ENOTEMPTY" || errorWithCode.code === "EBUSY";
  }
}
