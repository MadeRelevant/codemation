# S3 Binary Storage — Scaleway Setup Runbook

This document explains how to configure `@codemation/host` to use S3-compatible object storage
(Scaleway Object Storage) instead of the default local filesystem driver.

## Overview

`BinaryStorage` has two drivers:

| `BINARY_STORAGE_KIND` | Driver                         | Use case                      |
| --------------------- | ------------------------------ | ----------------------------- |
| `local` (default)     | `LocalFilesystemBinaryStorage` | Single-instance dev / on-prem |
| `s3`                  | `S3BinaryStorage`              | Multi-instance production     |

Key scheme: `<workspaceId>/<runId>/<binaryId>` — enabling prefix-based workspace erasure.

## Scaleway Object Storage setup

### 1. Create a bucket

1. Log in to the Scaleway console → **Object Storage** → **Create bucket**.
2. Choose a region (e.g. `nl-ams`).
3. Set **Visibility** to **Private**.
4. Note the bucket name (e.g. `my-codemation`).

The app does **not** create the bucket. It will fail to start if the bucket is unreachable.

### 2. Generate S3 API credentials

1. Console → **Identity and Access Management** → **API keys** → **Generate API key**.
2. Select **Object Storage** as the scope (or attach an IAM policy with `s3:*` on your bucket).
3. Note the **Access Key ID** and **Secret Access Key**.

### 3. Set environment variables

```env
BINARY_STORAGE_KIND=s3
BINARY_STORAGE_S3_ENDPOINT=https://s3.nl-ams.scw.cloud
BINARY_STORAGE_S3_REGION=nl-ams
BINARY_STORAGE_S3_BUCKET=my-codemation
BINARY_STORAGE_S3_ACCESS_KEY_ID=<access-key-id>
BINARY_STORAGE_S3_SECRET_ACCESS_KEY=<secret-access-key>
```

> **Regions**: `nl-ams`, `fr-par`, `pl-waw`, `us-east-1`. Match the bucket's region.

> **Endpoint format**: `https://s3.<region>.scw.cloud` (virtual-hosted style, no path-style).

### 4. Boot-time connectivity check

On startup, the host runs a `HeadBucket` request. If the bucket is unreachable or credentials are
wrong, the process exits immediately with a clear error message:

```
Error: S3 bucket connectivity check failed for bucket "my-codemation": ...
```

Fix the env vars and restart.

## Cross-field validation

If `BINARY_STORAGE_KIND=s3` is set but any of the `BINARY_STORAGE_S3_*` vars are missing or empty,
the process fails at boot with a Zod validation error listing the missing fields.

## Local development / testing

For local dev, keep `BINARY_STORAGE_KIND=local` (or unset it). Binary files land in
`${repoRoot}/.codemation/binary`.

For integration tests, `S3BinaryStorage` supports `forcePathStyle: true` (constructor second arg)
for use with MinIO / testcontainers.

## GDPR workspace erasure

`EraseWorkspaceCommandHandler` calls `binaryStorage.listByPrefix("<workspaceId>/")` and
`deleteMany(keys)` as part of workspace deletion. This ensures all binary attachments stored in S3
under a workspace are cleaned up when the workspace is erased.
