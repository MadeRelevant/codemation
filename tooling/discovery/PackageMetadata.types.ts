/**
 * Package metadata schema — v1.
 *
 * Each curated package emits `dist/metadata.json` at build time. The control-plane
 * indexer fetches the npm tarball, reads this file, and upserts catalog rows.
 * No sandbox, no dynamic introspection.
 *
 * Lifecycle:
 *   1. Author writes/decorates nodes or examples in the package source.
 *   2. `pnpm build:metadata` runs `tooling/discovery/scripts/extract-metadata.ts`.
 *   3. Extractor reads source files (decorators, JSDoc) and emits `dist/metadata.json`.
 *   4. CI (`pnpm run check:metadata`) validates that the file exists and is structurally
 *      correct for every package listed in `curated-packages.json`.
 *   5. Control-plane indexer reads the file from the published npm tarball.
 *
 * D3 override: if the package root contains `codemation.metadata.ts`, the extractor
 * reads it for explicit node/credential/example entries that override static analysis.
 */

export interface PackageMetadata {
  schemaVersion: 1;
  packageName: string; // e.g. "@codemation/core-nodes-slack"
  packageVersion: string; // mirrors package.json
  description: string; // mirrors package.json
  kind: "nodes" | "examples" | "skills" | "mixed";

  // Populated for node packages
  nodes?: NodeMetadata[];
  credentials?: CredentialMetadata[];

  // Populated for example packages
  examples?: ExampleMetadata[];

  // Populated for packages that ship SKILL.md files
  skills?: SkillMetadata[];
}

export interface NodeMetadata {
  name: string; // e.g. "SendSlackMessage"
  kind: "node" | "trigger";
  description: string; // from @nodeMetadata decorator or defineNode
  inputPorts: string[]; // declared input ports
  outputPorts: string[]; // declared output ports
  credentialRefs?: string[]; // credential type names the node uses
  sourcePath: string; // path within package, for debugging
  tags?: string[]; // free-form, drives search
}

export interface ExampleMetadata {
  name: string; // file slug
  description: string; // first JSDoc paragraph
  tags: string[]; // from frontmatter
  sourcePath: string; // path within package
  /**
   * Resolved concrete `@codemation/*` dependency versions (e.g. `{ "@codemation/core-nodes": "1.3.0" }`).
   * Values are always concrete semver point-version strings — never `workspace:*` or caret ranges.
   * An empty object means the example has no first-party dependency constraints (always `match`).
   */
  dependencies: Record<string, string>;
  code: string; // the example's full source, for the agent
}

export interface SkillMetadata {
  name: string; // SKILL.md `name` frontmatter field (directory slug as fallback)
  description: string; // SKILL.md `description` frontmatter field
  tags: string[]; // from `tags` frontmatter field (comma-separated, trimmed)
  sourcePath: string; // path within package, e.g. "skills/codemation-workflow-dsl/SKILL.md"
  /**
   * Resolved concrete `@codemation/*` dependency versions from the `uses` frontmatter field.
   * Values are always concrete semver point-version strings. An empty object means the skill
   * has no first-party dependency constraints and is universally available (always `match`).
   */
  dependencies: Record<string, string>;
  code: string; // full SKILL.md source (frontmatter + body)
}

export interface CredentialMetadata {
  name: string;
  description: string;
  fields: { key: string; type: string; required: boolean }[];
}

/**
 * Shape of `codemation.metadata.ts` override files.
 * The extractor imports (via static JSON parse) this type when the file exists.
 */
export interface PackageMetadataOverride {
  nodes?: NodeMetadata[];
  credentials?: CredentialMetadata[];
  examples?: ExampleMetadata[];
  skills?: SkillMetadata[];
}
