# `@codemation/agent-skills`

Publishable Codemation agent skills packaged as `SKILL.md` directories.

## What this package contains

- shared Codemation skills for CLI usage, workflow authoring, plugin development, credentials, and framework concepts
- a small extraction CLI that copies the packaged skills into a project-local `.agents/skills` directory

## Install in a project

```bash
pnpm add -D @codemation/agent-skills
codemation-agent-skills extract --output .agents/skills/extracted
```

The starter templates call the extractor automatically after `pnpm install`.

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
