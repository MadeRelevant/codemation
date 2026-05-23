---
"@codemation/host": minor
"@codemation/core": minor
---

feat(host/binary): S3BinaryStorage implementation + boot connectivity check (Sprint 15 Story 03)

Adds `S3BinaryStorage` — a Scaleway-compatible S3 implementation of `BinaryStorage` using
`@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (multipart for large payloads). Key scheme:
`<workspaceId>/<runId>/<binaryId>`.

Runtime selection is controlled by `BINARY_STORAGE_KIND` env var (`"local"` default | `"s3"`).
When `"s3"`, all `BINARY_STORAGE_S3_*` vars are required and validated at boot. A `HeadBucket`
connectivity check fails loudly on startup if the bucket is unreachable.

Extends `BinaryStorage` interface (core) with `deleteMany(keys)` and `listByPrefix(prefix)` for
bulk-delete (1000-key S3 batching) and workspace-prefix enumeration (GDPR erasure). All existing
implementations (`InMemoryBinaryStorage`, `LocalFilesystemBinaryStorage`, `UnavailableBinaryStorage`)
updated with correct implementations.
