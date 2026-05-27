import { injectable } from "@codemation/core";
import type { AppPersistenceConfig } from "../../presentation/config/AppConfig";

/**
 * Runs `prisma migrate deploy` against TCP PostgreSQL or a SQLite database file.
 *
 * This class is deliberately kept as a thin wrapper with no direct imports from
 * node:fs, node:path, node:module, or node:url. All heavy filesystem and dynamic-
 * require operations live in PrismaMigrationOperations, which is loaded lazily via
 * a runtime-computed `import(...)` path. The Turbopack / Next.js NFT module tracer
 * only follows statically-analysable import paths, so computing the specifier at
 * runtime prevents it from walking the whole project when tracing this file.
 */

// The import specifier is intentionally split so that static analysers (NFT / Turbopack)
// cannot resolve it at build time. The actual module loaded is always PrismaMigrationOperations.
const implSpecifier = /* @__PURE__ */ (() => {
  const base = "./PrismaMigration";
  const suffix = "Operations";
  return base + suffix;
})();

@injectable()
export class PrismaMigrationDeployer {
  async deployPersistence(persistence: AppPersistenceConfig, env?: Readonly<NodeJS.ProcessEnv>): Promise<void> {
    const { PrismaMigrationOperations } = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      implSpecifier
    );
    // eslint-disable-next-line codemation/no-manual-di-new -- lazy-loaded impl; cannot be registered in DI without breaking the bootstrap chain
    return new PrismaMigrationOperations().deployPersistence(persistence, env);
  }

  async deploy(args: Readonly<{ databaseUrl: string; env?: Readonly<NodeJS.ProcessEnv> }>): Promise<void> {
    const { PrismaMigrationOperations } = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      implSpecifier
    );
    // eslint-disable-next-line codemation/no-manual-di-new -- lazy-loaded impl; cannot be registered in DI without breaking the bootstrap chain
    return new PrismaMigrationOperations().deploy(args);
  }

  async resolvePackageRoot(env: Readonly<NodeJS.ProcessEnv> = process.env): Promise<string> {
    const { PrismaMigrationOperations } = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      implSpecifier
    );
    // eslint-disable-next-line codemation/no-manual-di-new -- lazy-loaded impl; cannot be registered in DI without breaking the bootstrap chain
    return new PrismaMigrationOperations().resolvePackageRoot(env);
  }
}
