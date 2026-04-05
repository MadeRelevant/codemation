import path from "node:path";

export interface FileExistencePort {
  exists(filePath: string): Promise<boolean>;
}

export interface InstalledHostPackageRootResolver {
  resolveInstalledHostPackageRoot(): string;
}

export class NextHostPackageRootResolver {
  constructor(
    private readonly fileExistencePort: FileExistencePort,
    private readonly installedHostPackageRootResolver: InstalledHostPackageRootResolver,
  ) {}

  async resolve(repoRoot: string, env: NodeJS.ProcessEnv): Promise<string> {
    const configuredRoot = env.CODEMATION_HOST_PACKAGE_ROOT?.trim();
    if (configuredRoot && configuredRoot.length > 0) {
      return path.resolve(configuredRoot);
    }
    const workspaceHostRoot = path.resolve(repoRoot, "packages", "host");
    if (await this.fileExistencePort.exists(path.resolve(workspaceHostRoot, "prisma", "schema.postgresql.prisma"))) {
      return workspaceHostRoot;
    }
    return this.installedHostPackageRootResolver.resolveInstalledHostPackageRoot();
  }
}
