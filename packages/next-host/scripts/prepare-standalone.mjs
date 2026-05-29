import { access, cp, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = module.createRequire(import.meta.url);
const hostRequire = module.createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "host", "package.json"),
);

class StandaloneRuntimePreparer {
  static externalStandalonePackages = ["@libsql/client", "@prisma/adapter-libsql"];

  static async run() {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const standaloneRoot = path.join(packageRoot, ".next", "standalone");
    const packagedAppRoot = path.join(standaloneRoot, "packages", "next-host");
    const standaloneNextRoot = path.join(packagedAppRoot, ".next");
    await mkdir(standaloneNextRoot, { recursive: true });
    await this.copyIfPresent(path.join(packageRoot, ".next", "static"), path.join(standaloneNextRoot, "static"));
    await this.copyIfPresent(path.join(packageRoot, ".next", "BUILD_ID"), path.join(standaloneNextRoot, "BUILD_ID"));
    await this.copyIfPresent(path.join(packageRoot, "public"), path.join(packagedAppRoot, "public"));
    await this.materializeStandaloneExternalPackages(standaloneRoot, packagedAppRoot);
    await this.copyHostMigrationOperations(packageRoot, standaloneRoot);
  }

  /**
   * PrismaMigrationDeployer loads PrismaMigrationOperations through a runtime-computed
   * `file://` import specifier that Next's static file tracer cannot follow, so the
   * standalone build omits the module and startup `migrate()` throws ERR_MODULE_NOT_FOUND
   * (every SSR request then 404s). The deployer resolves the sibling
   * `./PrismaMigrationOperations.js` against its own `/src/` location, so copy the
   * self-contained dist build to that mirrored path, plus a `type: module` marker so
   * Node loads the ESM file correctly.
   */
  static async copyHostMigrationOperations(packageRoot, standaloneRoot) {
    const hostRoot = path.resolve(packageRoot, "..", "host");
    const source = path.join(hostRoot, "dist", "infrastructure", "persistence", "PrismaMigrationOperations.js");
    if (!(await this.exists(source))) {
      throw new Error(`prepare-standalone: missing host dist build at ${source} (did @codemation/host build first?)`);
    }
    const targetDir = path.join(standaloneRoot, "packages", "host", "src", "infrastructure", "persistence");
    await mkdir(targetDir, { recursive: true });
    await cp(source, path.join(targetDir, "PrismaMigrationOperations.js"), { force: true });
    const hostPackageJson = path.join(standaloneRoot, "packages", "host", "package.json");
    if (!(await this.exists(hostPackageJson))) {
      await writeFile(hostPackageJson, `${JSON.stringify({ type: "module" }, null, 2)}\n`);
    }
  }

  static async copyIfPresent(sourcePath, targetPath) {
    try {
      await cp(sourcePath, targetPath, { force: true, recursive: true });
    } catch (error) {
      if (this.isMissingPathError(error)) {
        return;
      }
      throw error;
    }
  }

  static async materializeStandaloneExternalPackages(standaloneRoot, packagedAppRoot) {
    const standaloneNodeModulesRoot = path.join(standaloneRoot, "node_modules");
    const serverRoot = path.join(packagedAppRoot, ".next", "server");
    const aliasTargets = await this.collectExternalAliasTargets(standaloneRoot, serverRoot);
    const packageNames = new Set(this.externalStandalonePackages);
    for (const packageName of aliasTargets.values()) {
      packageNames.add(packageName);
    }
    for (const packageName of packageNames) {
      await this.copyPackageDirectory(
        standaloneRoot,
        packageName,
        path.join(standaloneNodeModulesRoot, ...packageName.split("/")),
      );
    }
    for (const [aliasName, packageName] of aliasTargets.entries()) {
      await this.copyPackageDirectory(
        standaloneRoot,
        packageName,
        path.join(standaloneNodeModulesRoot, ...aliasName.split("/")),
      );
    }
  }

  static async collectExternalAliasTargets(standaloneRoot, serverRoot) {
    const aliasTargets = new Map();
    for (const filePath of await this.listFiles(serverRoot)) {
      if (!filePath.endsWith(".js")) {
        continue;
      }
      const content = await readFile(filePath, "utf8");
      for (const match of content.matchAll(/(?:@[^"'`\s/]+\/)?[^"'`\s/]+-[a-f0-9]{16}/g)) {
        const aliasName = match[0];
        const packageName = aliasName.replace(/-[a-f0-9]{16}$/, "");
        if (await this.canResolvePackageRoot(standaloneRoot, packageName)) {
          aliasTargets.set(aliasName, packageName);
        }
      }
    }
    return aliasTargets;
  }

  static async listFiles(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFiles(entryPath)));
        continue;
      }
      files.push(entryPath);
    }
    return files;
  }

  static async copyPackageDirectory(standaloneRoot, packageName, targetPath) {
    const packageRoot = await realpath(await this.resolvePackageRoot(standaloneRoot, packageName));
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rm(targetPath, { force: true, recursive: true });
    await cp(packageRoot, targetPath, { force: true, recursive: true });
  }

  static async resolvePackageRoot(standaloneRoot, packageName) {
    const pnpmRoot = path.join(standaloneRoot, "node_modules", ".pnpm");
    for (const entryName of await readdir(pnpmRoot)) {
      const candidatePath = path.join(pnpmRoot, entryName, "node_modules", ...packageName.split("/"));
      if (await this.exists(candidatePath)) {
        return candidatePath;
      }
    }
    try {
      return path.dirname(require.resolve(`${packageName}/package.json`));
    } catch {
      return path.dirname(hostRequire.resolve(`${packageName}/package.json`));
    }
  }

  static async canResolvePackageRoot(standaloneRoot, packageName) {
    try {
      await this.resolvePackageRoot(standaloneRoot, packageName);
      return true;
    } catch {
      return false;
    }
  }

  static async exists(filePath) {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static isMissingPathError(error) {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code === "ENOENT",
    );
  }
}

await StandaloneRuntimePreparer.run();
