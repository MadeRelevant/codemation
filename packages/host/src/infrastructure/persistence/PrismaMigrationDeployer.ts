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

// The import specifier is intentionally split so static analysers (NFT / Turbopack)
// cannot resolve it at build time and trace the heavy fs/createRequire ops inside.
// We disambiguate source vs dist at runtime via `import.meta.url`, then resolve to
// an absolute `file://` URL. The absolute URL bypasses tsx-loader's namespace
// decoration, which otherwise propagates a `?tsx-namespace=...` query to every
// transitive `node:*` builtin import in PrismaMigrationOperations and trips
// `ENOENT: open 'node:path?tsx-namespace=...'` under the packaged smoke harness.
//  - source (Vitest, `pnpm dev`): the wrapper and operations are siblings under
//    `src/infrastructure/persistence/`, so the relative path is `./PrismaMigrationOperations.js`.
//  - dist (published tgz): tsdown inlines the wrapper into top-level chunks, while
//    the operations module is emitted as its own entry at
//    `dist/infrastructure/persistence/PrismaMigrationOperations.js`.
const implSpecifier = /* @__PURE__ */ (() => {
  const suffix = "Operations.js";
  const relativePath = import.meta.url.includes("/src/")
    ? "./PrismaMigration" + suffix
    : "./infrastructure/persistence/PrismaMigration" + suffix;
  // Absolute `file://` URL: keeps tsx-loader from propagating its
  // `?tsx-namespace=...` query to transitive node:* imports inside the
  // operations module, and keeps the Turbopack NFT tracer from following the
  // path statically (which would walk the heavy fs/createRequire ops).
  return new URL(relativePath, import.meta.url).href;
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
