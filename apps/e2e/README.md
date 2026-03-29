# `@codemation/e2e-app`

**Internal monorepo app** under `apps/e2e`: a sample consumer wired with `@codemation/cli`, `@codemation/host`, core nodes, and `@codemation/runtime-dev` for manual and scripted end-to-end checks. It is not a supported template for external apps.

## Install

Not published for standalone use. In the monorepo, dependencies resolve via `workspace:*`.

## When to use

Framework contributors use this app to exercise the full dev/build path. **Browser E2E tests** for the product live under **`@codemation/host`** (see that package’s Playwright/Vitest scripts), not here.

## Usage

From the monorepo, see `package.json` scripts `dev` and `build` for typical commands. Treat this directory as infrastructure for the Codemation repository only.
