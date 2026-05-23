# tooling/discovery

Build-time metadata extraction for curated Codemation packages.

## What is this?

Each curated package emits a `dist/metadata.json` file at build time. The control-plane indexer fetches npm tarballs, reads this file, and upserts catalog rows — no sandbox, no dynamic execution.

The schema version is `1`. The control plane refuses to index unknown versions.

## When does it run?

Each curated package's `build` script chains `build:metadata`:

```
"build": "tsdown && pnpm build:metadata",
"build:metadata": "tsx ../../tooling/discovery/scripts/extract-metadata.ts"
```

The extractor runs in `process.cwd()` (the package root) and writes `dist/metadata.json`.

## How to add a curated package

1. Add the npm package name to `tooling/discovery/curated-packages.json`.
2. Add `build:metadata` and update `build` in the package's `package.json`.
3. The extractor auto-detects `@nodeMetadata` decorators, `defineNode(...)` calls, `defineCredential(...)` calls, and `src/examples/*.example.ts` files.
4. If static analysis can't extract nodes (e.g. names come from dynamic config), create `codemation.metadata.json` at the package root — the extractor uses it as an override.

## Files

- `PackageMetadata.types.ts` — TypeScript interfaces for the schema.
- `PackageMetadataExtractor.ts` — main extractor class (`extract(packageRoot)`).
- `CredentialMetadataReader.ts` — helper: reads `defineCredential(...)` calls.
- `ExampleFrontmatterParser.ts` — helper: reads JSDoc frontmatter from `.example.ts` files.
- `PackageMetadataValidator.ts` — validates a `metadata.json` against the schema.
- `curated-packages.json` — list of packages subject to the CI gate.
- `scripts/extract-metadata.ts` — entry point for `build:metadata` scripts.

## CI gate

`pnpm run check:metadata` validates that every package in `curated-packages.json` has a
present and valid `dist/metadata.json`. It runs as part of `pnpm run check`.

Run it locally after a full build:

```bash
pnpm build  # turbo run build — populates all dist/
pnpm run check:metadata
```

## Example JSDoc frontmatter (for .example.ts files)

```ts
/**
 * Sends a Gmail message with an attachment.
 * @tags gmail, email, attachment
 * @uses @codemation/core-nodes-gmail
 */
export const workflow = builder.workflow("Send email", (flow) => {
  // ...
});
```

Supported tags: `@description`, `@tags` (comma-separated), `@uses` (comma-separated package names).
