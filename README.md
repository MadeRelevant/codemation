# Codemation

[![CI](https://github.com/MadeRelevant/codemation/actions/workflows/ci.yml/badge.svg)](https://github.com/MadeRelevant/codemation/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/MadeRelevant/codemation/graph/badge.svg?token=DQ1I6NK2LM)](https://codecov.io/gh/MadeRelevant/codemation)
[![npm @codemation/cli](https://img.shields.io/npm/v/@codemation/cli?label=npm%20%40codemation%2Fcli&logo=npm)](https://www.npmjs.com/package/@codemation/cli)
[![Documentation](https://img.shields.io/badge/docs-docs.maderelevant.com-0A0A0A?style=flat&logo=readthedocs&logoColor=white)](https://docs.maderelevant.com)
[![Made by MadeRelevant](https://img.shields.io/badge/MADE%20BY-MADERELEVANT-0A0A0A?style=flat)](https://maderelevant.com)

**Codemation** is a code-first automation framework for shipping AI and agentic workflows in TypeScript—triggers, run lifecycle, live progress, credentials, and a host you can run in dev and production.

The beginner path now leads with:

- `defineCodemationApp(...)` for app setup
- `workflow("...")` for fluent workflow authoring
- `defineNode(...)` and `defineCredential(...)` for simple custom extensions

---

## Getting started

Scaffold a new project (requires **Node.js 20+**):

```bash
npm create codemation@latest my-app
```

Then open the generated app and follow its README (environment, database, first run). Non-interactive options and details: [`packages/create-codemation/README.md`](packages/create-codemation/README.md).

---

## Documentation

**[docs.maderelevant.com](https://docs.maderelevant.com)** — guides, API reference, and plugin development.

Repository references for contributors: [`AGENTS.md`](AGENTS.md) (architecture and tests), [`docs/development-modes.md`](docs/development-modes.md) (framework vs consumer workflows).

---

## Contributing

See **[`CONTRIBUTING.md`](CONTRIBUTING.md)** for branches, pull requests, and local checks. Framework changes should follow [`AGENTS.md`](AGENTS.md).

---

## License

Licensing may vary by package; see each `package.json` under `packages/` and `apps/`.
