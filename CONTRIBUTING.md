# Contributing

## Branching and pull requests

- **Do not push directly to `main`.** Open a **pull request** from a feature branch.
- CI runs the full quality gates on each PR (format, full lint including duplicate detection and ast-grep rules, typecheck, the full test matrix, and **changeset status** when workspace packages change).
- **Changesets:** If your PR should affect a published package version, add a changeset before merge: `pnpm changeset` (or add the `.changeset/*.md` entry by hand). Docs-only or other exceptions that truly need no release note are rare—when in doubt, add a patch changeset. If you run **`pnpm changeset version` locally**, set **`GITHUB_TOKEN`** (classic PAT with `repo`, or `gh auth token`) so **`@changesets/changelog-github`** can resolve PR links; CI already has a token.
- **Branch protection (maintainers):** The `main` ruleset should list **one** required status check — the PR-only **`Merge requirements`** job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (workflow title is **`CI`**, so the check often appears as **`CI / Merge requirements`** in the GitHub UI). That job aggregates every other CI job: **feature PRs** must turn all of them **green**; **Changesets version-bump PRs** (`release/*`, `changeset-release/*` heads) intentionally **skip** the heavy jobs, and the gate still passes without admin bypass. Do **not** add each matrix row (`Format`, `Coverage — unit`, …) as separate required checks, or version PRs will be blocked again.

  After changing the merge gate job name in `ci.yml`, update the ruleset to match (copy the string from a green PR’s checks list).

  Inspect the ruleset:

  ```bash
  gh api repos/MadeRelevant/codemation/rulesets --jq '.[] | select(.name=="main") | .id'
  gh api repos/MadeRelevant/codemation/rulesets/RULESET_ID --jq '{bypass_actors, rules}'
  ```

  Replace `RULESET_ID` with the id from the first command (or open **Settings → Rules → Rulesets → main** in the GitHub UI).

- **Version bump PRs (Changesets):** The bot opens a branch such as **`changeset-release/main`** (or `release/version-packages` if configured) → `main`. Heavy CI jobs are **skipped** on that PR; only **`CI / Merge requirements`** must be green for merge. Do not push version bumps straight to `main`. Optionally configure **Vercel** (Ignored Build Step or ignore `release/**` previews) to avoid noisy deploys on those PRs.

- Keep PRs focused and reasonably small when possible.

## Local checks before you push

Husky runs a **fast pre-commit** hook:

1. **lint-staged** — Prettier on staged files
2. **`pnpm run changeset:verify`** — if you stage changes under a **publishable** `packages/*` path, a **`.changeset/*.md`** must be part of the same effective change (staged or already on your branch). Same rule as CI. Set **`SKIP_CHANGESET_VERIFY=1`** to bypass locally when appropriate.
3. **`pnpm run precommit`** — ESLint (`turbo run lint`), **typecheck**, and **unit tests** only

Each publishable package also exposes **`pnpm run changeset:verify`** (delegates to the workspace root) so you can run the check from a package directory without hunting for the script name.

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

## Auth model

Codemation now treats `@codemation/host` as the single auth/session authority.

- Browser login/logout/session flows use backend routes under `/api/auth/*`.
- `packages/next-host` is a thin UI shell: it renders the login page, calls `/api/auth/session` and `/api/auth/login`, and relies on backend-issued HttpOnly cookies.
- Do not add new NextAuth/Auth.js route handlers to `packages/next-host`; if auth behavior changes, change the host-owned route surface instead.

Current backend auth routes:

- `GET /api/auth/session` returns `200` with the current principal JSON or `null`.
- `POST /api/auth/login` accepts local credentials and sets the session cookie.
- `POST /api/auth/logout` clears the session cookie.
- `GET /api/auth/oauth/:provider/start` begins an OAuth/OIDC browser redirect.

Required env/config expectations:

- `AUTH_SECRET` signs backend session cookies.
- `BETTER_AUTH_URL` (preferred) or `CODEMATION_PUBLIC_BASE_URL` should match the browser-facing origin so Better Auth can build correct OAuth and session URLs; packaged `codemation dev` sets `CODEMATION_PUBLIC_BASE_URL` from the public UI URL.
- `CODEMATION_PUBLIC_BASE_URL` remains the shared public base for other host redirects (e.g. credential OAuth2) when tooling does not set `BETTER_AUTH_URL`.
- `CODEMATION_UI_AUTH_ENABLED=false` disables the UI login gate for explicit local-dev bypass scenarios only.

See [`docs/better-auth-host.md`](docs/better-auth-host.md) for the full split between Better Auth and Codemation-owned account policy.

## Auth migration notes

This is a clean cutover. Do not preserve or reintroduce dual auth stacks.

- There is no compatibility layer for legacy NextAuth route handlers or cookie names in `packages/next-host`.
- Upgrade work should target the backend-owned `/api/auth/*` surface directly.
- If you touch templates or the CLI dev environment, verify scaffolded apps still boot, return `200` from `/api/auth/session`, and can complete a real browser login flow.
