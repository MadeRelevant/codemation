import type { Logger } from "@codemation/host/next/server";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { WorkflowDiscoveryPathSegmentsComputer, WorkflowModulePathFinder } from "@codemation/host/server";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import { randomUUID } from "node:crypto";
import { access, copyFile, cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

import type { ConsumerBuildOptions } from "./consumerBuildOptions.types";

export type ConsumerOutputBuildSnapshot = Readonly<{
  buildVersion: string;
  configSourcePath: string | null;
  consumerRoot: string;
  manifestPath: string;
  outputEntryPath: string;
  outputRoot: string;
  /** Canonical emitted tree (`.codemation/output/build`): `app/`, `index.js`, etc. */
  emitOutputRoot: string;
  workflowSourcePaths: ReadonlyArray<string>;
  workflowDiscoveryPathSegmentsList: ReadonlyArray<readonly string[]>;
}>;

type BuildConfigMetadata = Readonly<{
  hasInlineWorkflows: boolean;
  workflowDiscoveryDirectories: ReadonlyArray<string>;
}>;

const defaultConsumerOutputLogger = new ServerLoggerFactory(logLevelPolicyFactory).create(
  "codemation-cli.consumer-output",
);

const defaultConsumerBuildOptions: ConsumerBuildOptions = Object.freeze({
  sourceMaps: true,
  target: "es2022",
});

export class ConsumerOutputBuilder {
  private static readonly ignoredDirectoryNames = new Set([".codemation", ".git", "dist", "node_modules"]);
  private static readonly supportedSourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
  private static readonly watchBuildDebounceMs = 75;
  private readonly workflowModulePathFinder = new WorkflowModulePathFinder();

  /** Last promoted build output used to copy-forward unchanged emitted files on incremental watch builds. */
  private lastPromotedSnapshot: ConsumerOutputBuildSnapshot | null = null;
  private pendingWatchEvents: Array<{ event: string; path: string }> = [];

  private activeBuildPromise: Promise<ConsumerOutputBuildSnapshot> | null = null;
  private watcher: FSWatcher | null = null;
  private watchBuildLoopPromise: Promise<void> | null = null;
  private watchBuildDebounceTimeout: NodeJS.Timeout | null = null;
  private hasQueuedWatchEvent = false;
  private hasPendingWatchBuild = false;
  private lastIssuedBuildVersion = 0;

  private readonly log: Logger;
  private readonly buildOptions: ConsumerBuildOptions;

  constructor(
    private readonly consumerRoot: string,
    logOverride?: Logger,
    buildOptionsOverride?: ConsumerBuildOptions,
    private readonly configPathOverride?: string,
  ) {
    this.log = logOverride ?? defaultConsumerOutputLogger;
    this.buildOptions = buildOptionsOverride ?? defaultConsumerBuildOptions;
  }

  async ensureBuilt(): Promise<ConsumerOutputBuildSnapshot> {
    if (!this.activeBuildPromise) {
      this.activeBuildPromise = this.buildInternal();
    }
    return await this.activeBuildPromise;
  }

  /**
   * Stops the chokidar watcher and clears debounce timers. Safe to call when not watching.
   * Used by tests and for clean shutdown when tearing down a dev session.
   */
  async disposeWatching(): Promise<void> {
    if (this.watchBuildDebounceTimeout) {
      clearTimeout(this.watchBuildDebounceTimeout);
      this.watchBuildDebounceTimeout = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.watchBuildLoopPromise = null;
  }

  async ensureWatching(
    args: Readonly<{
      onBuildStarted?: () => Promise<void>;
      onBuildCompleted: (snapshot: ConsumerOutputBuildSnapshot) => Promise<void>;
      onBuildFailed?: (error: Error) => Promise<void>;
    }>,
  ): Promise<void> {
    if (this.watcher) {
      return;
    }
    this.watcher = watch([this.consumerRoot], {
      ignoreInitial: true,
      ignored: this.createIgnoredMatcher(),
    });
    this.watcher.on("all", (eventName, rawPath) => {
      if (typeof rawPath === "string" && rawPath.length > 0) {
        this.pendingWatchEvents.push({
          event: eventName,
          path: path.resolve(rawPath),
        });
      }
      this.scheduleWatchBuild(args);
    });
  }

  private async flushWatchBuilds(
    args: Readonly<{
      onBuildStarted?: () => Promise<void>;
      onBuildCompleted: (snapshot: ConsumerOutputBuildSnapshot) => Promise<void>;
      onBuildFailed?: (error: Error) => Promise<void>;
    }>,
  ): Promise<void> {
    try {
      while (this.hasPendingWatchBuild) {
        this.hasPendingWatchBuild = false;
        if (args.onBuildStarted) {
          await args.onBuildStarted();
        }
        try {
          const watchEvents = this.takePendingWatchEvents();
          this.activeBuildPromise = this.buildInternal({ watchEvents });
          await args.onBuildCompleted(await this.activeBuildPromise);
        } catch (error) {
          const exception = error instanceof Error ? error : new Error(String(error));
          if (args.onBuildFailed && !this.hasPendingWatchBuild && !this.hasQueuedWatchEvent) {
            await args.onBuildFailed(exception);
          }
          this.log.error("consumer output rebuild failed", exception);
        }
      }
    } finally {
      this.watchBuildLoopPromise = null;
      if (this.hasPendingWatchBuild) {
        this.watchBuildLoopPromise = this.flushWatchBuilds(args);
      }
    }
  }

  private takePendingWatchEvents(): ReadonlyArray<{ event: string; path: string }> {
    const events = [...this.pendingWatchEvents];
    this.pendingWatchEvents = [];
    return events;
  }

  private async buildInternal(
    options?: Readonly<{ watchEvents: ReadonlyArray<{ event: string; path: string }> }>,
  ): Promise<ConsumerOutputBuildSnapshot> {
    const watchEvents = options?.watchEvents ?? [];
    const configSourcePath = await this.resolveConfigPath(this.consumerRoot);
    if (
      watchEvents.length > 0 &&
      this.lastPromotedSnapshot !== null &&
      configSourcePath !== null &&
      !this.requiresFullConsumerRebuild(watchEvents, configSourcePath)
    ) {
      const changedSourcePaths = this.resolveIncrementalEmitSourcePaths(watchEvents);
      if (changedSourcePaths.length > 0) {
        try {
          await access(this.lastPromotedSnapshot.emitOutputRoot);
          const snapshot = await this.buildInternalIncremental(changedSourcePaths);
          this.lastPromotedSnapshot = snapshot;
          return snapshot;
        } catch {
          // Fall back to a full rebuild (missing output, emit failure, etc.).
        }
      }
    }
    const snapshot = await this.buildInternalFull();
    this.lastPromotedSnapshot = snapshot;
    return snapshot;
  }

  private requiresFullConsumerRebuild(
    events: ReadonlyArray<{ event: string; path: string }>,
    configSourcePath: string,
  ): boolean {
    const resolvedConfig = path.resolve(configSourcePath);
    for (const entry of events) {
      if (entry.event !== "change") {
        return true;
      }
      if (path.resolve(entry.path) === resolvedConfig) {
        return true;
      }
      if (this.shouldCopyAssetPath(entry.path)) {
        return true;
      }
    }
    return false;
  }

  private resolveIncrementalEmitSourcePaths(
    events: ReadonlyArray<{ event: string; path: string }>,
  ): ReadonlyArray<string> {
    const uniquePaths = new Set<string>();
    for (const entry of events) {
      if (entry.event !== "change") {
        return [];
      }
      if (this.shouldCopyAssetPath(entry.path)) {
        return [];
      }
      if (!this.shouldEmitSourcePath(entry.path)) {
        continue;
      }
      uniquePaths.add(path.resolve(entry.path));
    }
    return [...uniquePaths];
  }

  private async prepareEmitBuildSnapshot(
    args: Readonly<{
      configSourcePath: string;
      buildVersion: string;
    }>,
  ): Promise<
    Readonly<{
      stagedSnapshot: ConsumerOutputBuildSnapshot;
      outputAppRoot: string;
      finalBuildRoot: string;
      stagingBuildRoot: string;
    }>
  > {
    const outputRoot = this.resolveOutputRoot();
    const finalBuildRoot = this.resolveFinalBuildOutputRoot();
    const stagingBuildRoot = this.resolveStagingBuildRoot(args.buildVersion);
    const outputAppRoot = path.resolve(stagingBuildRoot, "app");
    const configMetadata = await this.loadConfigMetadata(args.configSourcePath);
    const workflowSourcePaths = await this.resolveWorkflowSources(this.consumerRoot, configMetadata);
    const pathSegmentsComputer = new WorkflowDiscoveryPathSegmentsComputer();
    const workflowDiscoveryPathSegmentsList = workflowSourcePaths.map((sourcePath) => {
      const segments = pathSegmentsComputer.compute({
        consumerRoot: this.consumerRoot,
        workflowDiscoveryDirectories: configMetadata.workflowDiscoveryDirectories,
        absoluteWorkflowModulePath: sourcePath,
      });
      return segments ?? [];
    });
    const stagedSnapshot: ConsumerOutputBuildSnapshot = {
      buildVersion: args.buildVersion,
      configSourcePath: args.configSourcePath,
      consumerRoot: this.consumerRoot,
      manifestPath: this.resolveCurrentManifestPath(),
      outputEntryPath: path.resolve(stagingBuildRoot, "index.js"),
      outputRoot,
      emitOutputRoot: stagingBuildRoot,
      workflowSourcePaths,
      workflowDiscoveryPathSegmentsList,
    };
    return { stagedSnapshot, outputAppRoot, finalBuildRoot, stagingBuildRoot };
  }

  private async emitStagingBuildAndPromote(
    args: Readonly<{
      configSourcePath: string;
      stagedSnapshot: ConsumerOutputBuildSnapshot;
      outputAppRoot: string;
      finalBuildRoot: string;
      stagingBuildRoot: string;
      emitOutputFiles: () => Promise<void>;
    }>,
  ): Promise<ConsumerOutputBuildSnapshot> {
    let promoted = false;
    try {
      await args.emitOutputFiles();
      await this.writeEntryFile({
        configSourcePath: args.configSourcePath,
        outputAppRoot: args.outputAppRoot,
        snapshot: args.stagedSnapshot,
      });
      await this.promoteStagingToFinalBuild({
        finalBuildRoot: args.finalBuildRoot,
        stagingBuildRoot: args.stagingBuildRoot,
      });
      promoted = true;
      return {
        ...args.stagedSnapshot,
        outputEntryPath: path.resolve(args.finalBuildRoot, "index.js"),
        emitOutputRoot: args.finalBuildRoot,
      };
    } finally {
      if (!promoted) {
        await rm(args.stagingBuildRoot, { force: true, recursive: true }).catch(() => null);
      }
    }
  }

  private async buildInternalIncremental(
    changedSourcePaths: ReadonlyArray<string>,
  ): Promise<ConsumerOutputBuildSnapshot> {
    const previous = this.lastPromotedSnapshot;
    if (!previous) {
      throw new Error("Incremental consumer build requires a previous successful build output.");
    }
    const configSourcePath = await this.resolveConfigPath(this.consumerRoot);
    if (!configSourcePath) {
      throw new Error(
        'Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".',
      );
    }
    const runtimeSourcePaths = await this.collectRuntimeSourcePaths();
    const runtimeSourceSet = new Set(runtimeSourcePaths.map((sourcePath) => path.resolve(sourcePath)));
    for (const changedPath of changedSourcePaths) {
      if (!runtimeSourceSet.has(path.resolve(changedPath))) {
        throw new Error("Incremental build saw a changed path outside the current runtime source set; rebuild full.");
      }
    }
    const buildVersion = this.createBuildVersion();
    const { stagedSnapshot, outputAppRoot, finalBuildRoot, stagingBuildRoot } = await this.prepareEmitBuildSnapshot({
      configSourcePath,
      buildVersion,
    });
    return await this.emitStagingBuildAndPromote({
      configSourcePath,
      stagedSnapshot,
      outputAppRoot,
      finalBuildRoot,
      stagingBuildRoot,
      emitOutputFiles: async () => {
        await cp(previous.emitOutputRoot, stagingBuildRoot, { recursive: true });
        for (const sourcePath of changedSourcePaths) {
          await this.emitSourceFile({
            outputAppRoot,
            sourcePath,
          });
        }
      },
    });
  }

  private async buildInternalFull(): Promise<ConsumerOutputBuildSnapshot> {
    const configSourcePath = await this.resolveConfigPath(this.consumerRoot);
    if (!configSourcePath) {
      throw new Error(
        'Codemation config not found. Expected "codemation.config.ts" in the consumer project root or "src/".',
      );
    }
    const runtimeSourcePaths = await this.collectRuntimeSourcePaths();
    const buildVersion = this.createBuildVersion();
    const { stagedSnapshot, outputAppRoot, finalBuildRoot, stagingBuildRoot } = await this.prepareEmitBuildSnapshot({
      configSourcePath,
      buildVersion,
    });
    return await this.emitStagingBuildAndPromote({
      configSourcePath,
      stagedSnapshot,
      outputAppRoot,
      finalBuildRoot,
      stagingBuildRoot,
      emitOutputFiles: async () => {
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
        await this.emitConfigSourceFile(outputAppRoot, configSourcePath, runtimeSourcePaths);
      },
    });
  }

  private scheduleWatchBuild(
    args: Readonly<{
      onBuildStarted?: () => Promise<void>;
      onBuildCompleted: (snapshot: ConsumerOutputBuildSnapshot) => Promise<void>;
      onBuildFailed?: (error: Error) => Promise<void>;
    }>,
  ): void {
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
    }, ConsumerOutputBuilder.watchBuildDebounceMs);
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
        if (ConsumerOutputBuilder.ignoredDirectoryNames.has(entry.name)) {
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
    return ConsumerOutputBuilder.supportedSourceExtensions.has(extension);
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
    const rewrittenOutputText = await this.rewriteRelativeImportSpecifiers(
      args.sourcePath,
      transpiledOutput.outputText,
    );
    const outputPath = this.resolveOutputPath(args.outputAppRoot, args.sourcePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rewrittenOutputText, "utf8");
    if (transpiledOutput.sourceMapText) {
      await writeFile(`${outputPath}.map`, transpiledOutput.sourceMapText, "utf8");
    }
  }

  private async emitConfigSourceFile(
    outputAppRoot: string,
    configSourcePath: string,
    runtimeSourcePaths: ReadonlyArray<string>,
  ): Promise<void> {
    const normalizedConfigSourcePath = path.resolve(configSourcePath);
    const alreadyEmitted = runtimeSourcePaths.some(
      (sourcePath) => path.resolve(sourcePath) === normalizedConfigSourcePath,
    );
    if (alreadyEmitted) {
      return;
    }
    await this.emitSourceFile({
      outputAppRoot,
      sourcePath: normalizedConfigSourcePath,
    });
  }

  private createCompilerOptions(): ts.CompilerOptions {
    const scriptTarget = this.buildOptions.target === "es2020" ? ts.ScriptTarget.ES2020 : ts.ScriptTarget.ES2022;
    return {
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      inlineSources: this.buildOptions.sourceMaps,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      sourceMap: this.buildOptions.sourceMaps,
      target: scriptTarget,
      useDefineForClassFields: false,
    };
  }

  private async writeEntryFile(
    args: Readonly<{
      configSourcePath: string;
      outputAppRoot: string;
      snapshot: ConsumerOutputBuildSnapshot;
    }>,
  ): Promise<void> {
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
        const importPath = this.resolveOutputImportPath(
          args.outputAppRoot,
          args.snapshot.outputEntryPath,
          workflowSourcePath,
        );
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
    const workflowDiscoveryPathSegmentsListExpression = JSON.stringify(args.snapshot.workflowDiscoveryPathSegmentsList);
    const outputText = [
      `import * as configModule from "${configImportPath}";`,
      'import { CodemationConsumerAppResolver } from "@codemation/host/consumer";',
      workflowImportBlocks,
      "const resolver = new CodemationConsumerAppResolver();",
      `export const codemationConsumerBuildVersion = ${JSON.stringify(args.snapshot.buildVersion)};`,
      `export const codemationConsumerApp = resolver.resolve({`,
      "  configModule,",
      `  workflowModules: ${workflowModulesExpression},`,
      `  workflowSourcePaths: ${workflowSourcePathsExpression},`,
      `  workflowDiscoveryPathSegmentsList: ${workflowDiscoveryPathSegmentsListExpression},`,
      "});",
      "export default codemationConsumerApp;",
      "",
    ]
      .filter((line: string) => line.length > 0)
      .join("\n");
    await writeFile(args.snapshot.outputEntryPath, outputText, "utf8");
  }

  private async rewriteRelativeImportSpecifiers(sourcePath: string, outputText: string): Promise<string> {
    let nextOutputText = await this.rewritePatternMatches(
      sourcePath,
      outputText,
      /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    );
    nextOutputText = await this.rewritePatternMatches(
      sourcePath,
      nextOutputText,
      /(import\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    );
    nextOutputText = await this.rewritePatternMatches(
      sourcePath,
      nextOutputText,
      /(import\s*\(\s*["'])(\.{1,2}\/[^"']+)(["']\s*\))/g,
    );
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
      rewrittenText = rewrittenText.replace(
        `${match[1]}${currentSpecifier}${match[3]}`,
        `${match[1]}${nextSpecifier}${match[3]}`,
      );
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
    for (const sourceExtension of ConsumerOutputBuilder.supportedSourceExtensions) {
      if (await this.fileExists(`${resolvedBasePath}${sourceExtension}`)) {
        return `${importSpecifier}${this.toJavascriptExtension(sourceExtension)}`;
      }
    }
    return null;
  }

  private async resolveIndexImportSpecifier(sourcePath: string, importSpecifier: string): Promise<string | null> {
    const resolvedDirectoryPath = path.resolve(path.dirname(sourcePath), importSpecifier);
    for (const sourceExtension of ConsumerOutputBuilder.supportedSourceExtensions) {
      const indexSourcePath = path.resolve(resolvedDirectoryPath, `index${sourceExtension}`);
      if (await this.fileExists(indexSourcePath)) {
        return `${importSpecifier}/index${this.toJavascriptExtension(sourceExtension)}`;
      }
    }
    return null;
  }

  private resolveOutputImportPath(
    outputAppRoot: string,
    outputEntryPath: string,
    sourcePath: string | null,
  ): string | null {
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

  private resolveFinalBuildOutputRoot(): string {
    return path.resolve(this.resolveOutputRoot(), "build");
  }

  private resolveStagingBuildRoot(buildVersion: string): string {
    return path.resolve(this.resolveOutputRoot(), "staging", `${buildVersion}-${randomUUID()}`);
  }

  private resolveCurrentManifestPath(): string {
    return path.resolve(this.resolveOutputRoot(), "current.json");
  }

  private async promoteStagingToFinalBuild(
    args: Readonly<{ finalBuildRoot: string; stagingBuildRoot: string }>,
  ): Promise<void> {
    await mkdir(path.dirname(args.finalBuildRoot), { recursive: true });
    await rm(args.finalBuildRoot, { force: true, recursive: true }).catch(() => null);
    await rename(args.stagingBuildRoot, args.finalBuildRoot);
  }

  private isRuntimeExtension(extension: string): boolean {
    return extension === ".cjs" || extension === ".js" || extension === ".json" || extension === ".mjs";
  }

  private isSourceExtension(extension: string): boolean {
    return ConsumerOutputBuilder.supportedSourceExtensions.has(extension);
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
        .some((segment: string) => ConsumerOutputBuilder.ignoredDirectoryNames.has(segment));
    };
  }

  private toConsumerRelativePath(filePath: string): string {
    return path.relative(this.consumerRoot, filePath);
  }

  private createBuildVersion(): string {
    const nextBuildVersion = Math.max(Date.now(), this.lastIssuedBuildVersion + 1);
    this.lastIssuedBuildVersion = nextBuildVersion;
    return `${nextBuildVersion}-${process.pid}`;
  }

  private async resolveConfigPath(consumerRoot: string): Promise<string | null> {
    const configuredOverride = this.configPathOverride?.trim();
    if (configuredOverride && configuredOverride.length > 0) {
      const resolvedOverride = path.resolve(configuredOverride);
      if (await this.fileExists(resolvedOverride)) {
        return resolvedOverride;
      }
      throw new Error(`Codemation config override not found at ${resolvedOverride}.`);
    }
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

  private async loadConfigMetadata(configSourcePath: string): Promise<BuildConfigMetadata> {
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
        workflowDiscoveryDirectories: [...WorkflowModulePathFinder.defaultWorkflowDirectories],
      };
    }
    const workflowDiscovery = this.readObjectLiteralProperty(configObjectLiteral, "workflowDiscovery");
    const workflowDiscoveryDirectories = this.readStringArrayProperty(workflowDiscovery, "directories");
    return {
      hasInlineWorkflows: this.hasProperty(configObjectLiteral, "workflows"),
      workflowDiscoveryDirectories:
        workflowDiscoveryDirectories.length > 0
          ? workflowDiscoveryDirectories
          : [...WorkflowModulePathFinder.defaultWorkflowDirectories],
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
    const namedConfigLiteral =
      objectLiteralsByIdentifier.get("codemationHost") ?? objectLiteralsByIdentifier.get("config");
    if (namedConfigLiteral) {
      return namedConfigLiteral;
    }
    return exportedObjectLiterals[0] ?? null;
  }

  private hasExportModifier(statement: ts.Node): boolean {
    return ts.canHaveModifiers(statement)
      ? (ts.getModifiers(statement)?.some((modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
          false)
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

  private readObjectLiteralProperty(
    objectLiteral: ts.ObjectLiteralExpression,
    propertyName: string,
  ): ts.ObjectLiteralExpression | null {
    const property = this.getPropertyAssignment(objectLiteral, propertyName);
    return this.unwrapObjectLiteralExpression(property?.initializer);
  }

  private readStringArrayProperty(
    objectLiteral: ts.ObjectLiteralExpression | null,
    propertyName: string,
  ): ReadonlyArray<string> {
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

  private getPropertyAssignment(
    objectLiteral: ts.ObjectLiteralExpression,
    propertyName: string,
  ): ts.PropertyAssignment | null {
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

  private async resolveWorkflowSources(
    consumerRoot: string,
    configMetadata: BuildConfigMetadata,
  ): Promise<ReadonlyArray<string>> {
    if (configMetadata.hasInlineWorkflows) {
      return [];
    }
    const discoveredPaths = await this.workflowModulePathFinder.discoverModulePaths({
      consumerRoot,
      workflowDirectories: configMetadata.workflowDiscoveryDirectories,
      exists: (absolutePath) => this.fileExists(absolutePath),
    });
    return [...discoveredPaths].sort((left: string, right: string) => left.localeCompare(right));
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
