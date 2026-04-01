# Contributing

## Branching and pull requests

- **Do not push directly to `main`.** Open a **pull request** from a feature branch.
- CI runs the full quality gates on each PR (format, full lint including duplicate detection and ast-grep rules, typecheck, and the full test matrix).
- Keep PRs focused and reasonably small when possible.

## Local checks before you push

Husky runs a **fast pre-commit** hook:

1. **lint-staged** — Prettier on staged files
2. **`pnpm run precommit`** — ESLint (`turbo run lint`), **typecheck**, and **unit tests** only

It does **not** run integration/UI/browser/e2e tests, full `pnpm test`, or repo-wide duplicate / antipattern scans. Those run in **CI** via `pnpm lint` (full), `pnpm typecheck`, and the test suites.

To match CI lint locally before opening a PR:

```bash
pnpm run lint
```

To run the same broad check as CI’s static job plus tests:

```bash
pnpm run check
```

See [`AGENTS.md`](AGENTS.md) for architecture, testing standards, and review expectations.
