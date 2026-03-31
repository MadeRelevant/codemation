import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";

import {
  NextHostPackageRootResolver,
  type FileExistencePort,
  type HostPackageJsonPathResolver,
} from "../src/server/NextHostPackageRootResolver";

class StubFileExistencePort implements FileExistencePort {
  constructor(private readonly existingPaths: ReadonlySet<string>) {}

  async exists(filePath: string): Promise<boolean> {
    return this.existingPaths.has(path.resolve(filePath));
  }
}

class StubHostPackageJsonPathResolver implements HostPackageJsonPathResolver {
  constructor(private readonly hostPackageJsonPath: string) {}

  resolveHostPackageJsonPath(): string {
    return this.hostPackageJsonPath;
  }
}

test("resolver prefers an explicit CODEMATION_HOST_PACKAGE_ROOT override", async () => {
  const resolver = new NextHostPackageRootResolver(
    new StubFileExistencePort(new Set()),
    new StubHostPackageJsonPathResolver("/installed/node_modules/@codemation/host/package.json"),
  );

  const resolved = await resolver.resolve("/repo", {
    CODEMATION_HOST_PACKAGE_ROOT: "/custom/host",
  });

  assert.equal(resolved, path.resolve("/custom/host"));
});

test("resolver uses the workspace host package when repoRoot contains packages/host", async () => {
  const repoRoot = "/repo";
  const resolver = new NextHostPackageRootResolver(
    new StubFileExistencePort(new Set([path.resolve(repoRoot, "packages", "host", "prisma", "schema.prisma")])),
    new StubHostPackageJsonPathResolver("/installed/node_modules/@codemation/host/package.json"),
  );

  const resolved = await resolver.resolve(repoRoot, {});

  assert.equal(resolved, path.resolve(repoRoot, "packages", "host"));
});

test("resolver falls back to the installed @codemation/host package for external consumers", async () => {
  const resolver = new NextHostPackageRootResolver(
    new StubFileExistencePort(new Set()),
    new StubHostPackageJsonPathResolver("/installed/node_modules/@codemation/host/package.json"),
  );

  const resolved = await resolver.resolve("/external/my-automation", {});

  assert.equal(resolved, "/installed/node_modules/@codemation/host");
});
