import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PrismaMigrationDeployer } from "../../src/infrastructure/persistence/PrismaMigrationDeployer";

describe("PrismaMigrationDeployer", () => {
  it("wraps PGlite open failures with a dev recovery hint", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "codemation-pglite-open-fail-"));
    const fileNotDir = path.join(dir, "data");
    await writeFile(fileNotDir, "not-a-pglite-datadir", "utf8");
    const deployer = new PrismaMigrationDeployer();
    await expect(deployer.deployPersistence({ kind: "pglite", dataDir: fileNotDir }, process.env)).rejects.toThrow(
      /PGlite could not open.*delete that directory/,
    );
    await rm(dir, { recursive: true, force: true });
  });
});
