# `@codemation/agent-skills`

Publishable Codemation agent skills packaged as `SKILL.md` directories.

## What this package contains

- shared Codemation skills for CLI usage, workflow authoring, plugin development, credentials, and framework concepts
- a small extraction CLI that copies the packaged skills into a project-local `.agents/skills` directory
- a programmatic API (`@codemation/agent-skills`) used by `@codemation/cli` to refresh packaged skills on consumer workflows

## Install in a project

```bash
pnpm add -D @codemation/agent-skills
codemation-agent-skills extract --output .agents/skills/extracted
```

The starter templates call the extractor automatically after `pnpm install`.

## Framework-managed copy

The directory `.agents/skills/extracted` is **framework-managed**:

- In consumer projects, Codemation overwrites packaged `codemation-*` skill folders there and removes stale packaged skill directories when you run `codemation dev`, `codemation build`, `codemation serve web`, `codemation dev:plugin`, or `codemation skills sync`.
- Inside the Codemation framework monorepo, the automatic refresh path is disabled to avoid polluting the local git worktree during framework development.
- After upgrading `@codemation/cli` or `@codemation/agent-skills` while working in the monorepo, run `codemation skills sync` intentionally if you want the extracted copy refreshed.

Put project-local skills in sibling folders under `.agents/skills`, not inside `extracted`, unless you accept them being replaced.

## Programmatic use

```js
import { FileSystemGateway, SkillExtractor, resolveAgentSkillsPackageRoot } from "@codemation/agent-skills";

const consumerRoot = process.cwd();
const extractor = new SkillExtractor(
  new FileSystemGateway(),
  resolveAgentSkillsPackageRoot(),
  consumerRoot,
  process.stdout,
);
await extractor.extract(".agents/skills/extracted");
```

## Published layout

```text
skills/
  codemation-cli/
  codemation-workflow-dsl/
  codemation-custom-node-development/
  codemation-plugin-development/
  codemation-credential-development/
  codemation-framework-concepts/
```
