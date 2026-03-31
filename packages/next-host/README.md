# `@codemation/next-host`

The **production Next.js host** for Codemation: App Router app, UI features (workflows, credentials, users), and server wiring that delegates to `@codemation/host`. Published packages ship a prebuilt standalone runtime for consumer apps, while framework authors can still run `next dev` from this package during local development.

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

Consumer apps normally start the packaged standalone runtime through `@codemation/cli`. Framework authors can still run the raw Next CLI (`next dev`, `next start`) from this package while iterating on the host itself. See `package.json` scripts `dev:next`, `build`, and `start`.
