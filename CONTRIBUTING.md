# Contributing

## Branching and pull requests

- **Do not push directly to `main`.** Open a **pull request** from a feature branch.
- CI runs the full quality gates on each PR (format, full lint including duplicate detection and ast-grep rules, typecheck, the full test matrix, and **changeset status** when workspace packages change).
- **Changesets:** If your PR should affect a published package version, add a changeset before merge: `pnpm changeset` (or add the `.changeset/*.md` entry by hand). Docs-only or other exceptions that truly need no release note are rare—when in doubt, add a patch changeset.
- **Branch protection (maintainers):** The `main` ruleset lists **required status checks** that must match the **job names** in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (the `name:` field for each job / matrix row). After changing CI job names, update the ruleset so contexts stay in sync.

  Current checks (copy the strings exactly, including `—` and `&`):

  | Context                                |
  | -------------------------------------- |
  | `Format`                               |
  | `Lint ESLint`                          |
  | `Lint repo`                            |
  | `Typecheck`                            |
  | `Template packaged smoke`              |
  | `Template interactive Verdaccio smoke` |
  | `Coverage — unit`                      |
  | `Coverage — integration`               |
  | `Coverage — UI`                        |
  | `Coverage — browser`                   |
  | `Coverage — e2e`                       |
  | `Merge coverage & Codecov`             |
  | `Verify changeset`                     |

  Inspect the ruleset:

  ```bash
  gh api repos/MadeRelevant/codemation/rulesets --jq '.[] | select(.name=="main") | .id'
  gh api repos/MadeRelevant/codemation/rulesets/RULESET_ID --jq '.rules[] | select(.type=="required_status_checks")'
  ```

  Replace `RULESET_ID` with the id from the first command (or open **Settings → Rules → Rulesets → main** in the GitHub UI).

- **Version bump PRs (Changesets):** The bot opens **`release/version-packages`** → `main` with version + changelog updates. Full **CI is skipped** on that PR (industry pattern: bot-only diffs, low risk). **Merge** using **Allow merge without waiting for requirements** (maintainers) or add your **Maintainer** role to the ruleset **bypass** list so you are not blocked by missing checks. Optionally configure **Vercel** (Ignored Build Step or ignore `release/**` previews) to avoid noisy deploys on those PRs.

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
