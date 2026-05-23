---
"@codemation/host": minor
"@codemation/cli": patch
---

Introduce a cross-platform `ProcessRunner` seam (interface + execa-backed `ExecaProcessRunner`) exported from `@codemation/host/server`, registered in `AppContainerFactory` under `ApplicationTokens.ProcessRunner`. Migrate every CLI site that previously spawned bare external commands (`pnpm exec next dev` and the packaged Next UI in `DevCommand`, `pnpm exec next start` in `ServeWebCommand`, `pnpm --filter … dev` in `WorkspacePluginDevProcessCoordinator`, `pnpm exec prisma migrate deploy` in `PrismaMigrateDeployInvoker`) so Windows finds `pnpm.cmd` / `pnpm.ps1` shims via execa's PATH resolution instead of erroring with ENOENT. Replace the bash-only `realpath "$(command -v pnpm)"` lookup in `packages/host/scripts/generate-prisma-clients.mjs` with an `execaSync("pnpm", ["root", "-g"])` probe. Fix the root `dev:framework` script's single-quoted command tokens (broken on Windows `cmd.exe`) by switching to escaped double quotes so it works on cmd, PowerShell, bash and zsh.
