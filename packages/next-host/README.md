# `@codemation/next-host`

The **production Next.js host** for Codemation: App Router app, UI features (workflows, credentials, users), and server wiring that delegates to `@codemation/host`. The CLI runs `next start` / dev from this package when you `serve web` or develop a consumer app.

## Install

```bash
pnpm add @codemation/next-host@^0.0.0
# or
npm install @codemation/next-host@^0.0.0
```

## When to use

Consumer projects depend on this package when they use the **stock Codemation web UI** rather than a fully custom front end. Framework authors iterate on layout, screens, and forms here; feature code follows DDD/CQRS patterns described in the repo’s contributor docs.

## Usage

The package exports a Next host bootstrap type:

```ts
import { CodemationNextHost } from "@codemation/next-host";
```

Day-to-day apps run via Next CLI (`next dev`, `next start`) with environment and consumer manifest supplied by `@codemation/cli` or your own orchestration. See `package.json` scripts `dev:next`, `build`, and `start`.
