# Codemation Managed Workspace

A managed workspace pre-configured for use with the Codemation control plane.

## Overview

This workspace is designed to run as a managed instance provisioned by the Codemation control plane. It uses:

- **PostgreSQL** for persistence (provisioned automatically).
- **CP-issued JWT bearers** for authentication (no local login flow).
- **Auto-discovered workflows** from `./src/workflows` — drop a `*.ts` file there and it's registered automatically.

## Adding workflows

Create a `.ts` file in `src/workflows/` that exports a workflow:

```ts
import { workflow } from "@codemation/host/authoring";

export default workflow("my-workflow", (wf) => {
  // ...
});
```

No changes to `codemation.config.ts` are needed.

## Environment variables

See `.env.example` for the full list. In production, all variables are injected by the provisioner.

For local development against a control-plane dev instance, copy `.env.example` to `.env` and fill in the values provided by your CP admin.

## Development

```bash
pnpm install
pnpm dev
```
