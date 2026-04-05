import { access } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

import { HostPackageRootResolver } from "../src/database/HostPackageRootResolver";

test("resolves @codemation/host to a directory that contains prisma/schema.postgresql.prisma", async () => {
  const resolver = new HostPackageRootResolver();
  const hostRoot = resolver.resolveHostPackageRoot();
  const schemaPath = path.join(hostRoot, "prisma", "schema.postgresql.prisma");
  await expect(access(schemaPath)).resolves.toBeUndefined();
});
