---
"@codemation/host": patch
---

fix(host): lazy-load migration ops to prevent NFT tracer from tracing the whole project

Moves all dynamic fs/path/createRequire operations out of PrismaMigrationDeployer's static
module surface into a sibling PrismaMigrationOperations class loaded via a runtime-computed
`await import(...)`. This prevents the Turbopack/Next.js NFT tracer from following dynamic
filesystem calls and erroneously tracing the entire project on next-host builds.
