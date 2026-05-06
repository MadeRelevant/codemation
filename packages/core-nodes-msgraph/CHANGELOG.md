# @codemation/core-nodes-msgraph

## 0.1.0

### Minor Changes

- [#114](https://github.com/MadeRelevant/codemation/pull/114) [`ec985a3`](https://github.com/MadeRelevant/codemation/commit/ec985a3264696b421e8be7c84c7cead6a85cbe6c) Thanks [@cblokland90](https://github.com/cblokland90)! - Initial release of `@codemation/core-nodes-msgraph` — Microsoft Graph integration for Codemation. Covers Outlook mail, OneDrive / SharePoint Drive, and Excel workbook operations.

  **Authoring**: every node is a single declarative `defineNode({...})` (or `definePollingTrigger` / `defineRestNode`). Credentials are split into two focused types — `msgraph-mail-oauth` (Outlook scopes) and `msgraph-drive-oauth` (OneDrive / SharePoint / Excel scopes) — so users connect each service with the narrowest scope set.

  **Outlook (6 nodes + trigger)**: `OnNewMsGraphMailTrigger` (polling, with attachment metadata + optional binary download), `OutlookMessageGet`, `OutlookMessageReply`, `OutlookMessageSend`, `OutlookMessagePatch`, `OutlookFolderResolve`.

  **Drive (8 nodes)**: `DriveResolve` (5-variant lookup: personalPath, sharedLink, driveItem, sharedWithMe, byName), `DriveListChildren`, `DriveItemGet`, `DriveDownload`, `DriveUpload` (auto simple-PUT vs chunked session at 4 MiB), `DriveCopy` (async 202 with monitor polling), `DriveListMyDrives`, `DriveListSharedWithMe`.

  **Excel workbook (7 nodes)**: session-managed `ExcelOpenWorkbook` / `ExcelCloseWorkbook` with cookie-affinity + transparent session renewal, `ExcelListWorksheets`, `ExcelReadRange`, `ExcelWriteRange`, `ExcelAddSheet` (idempotent — create-or-reuse), `ExcelStyleRange` (font / fill / alignment / borders / numberFormat / merge / autofit, batched + Graph-conformant sub-resource PATCHes).

  **Chaining ergonomics**: drive nodes and `ExcelOpenWorkbook` fall back to `item.json.driveId` / `itemId` when their cfg fields are empty; Excel session nodes fall back to the flat `WorkbookHandle` fields on `item.json`. So `DriveResolve → ExcelOpenWorkbook → ExcelWriteRange → ExcelCloseWorkbook` runs end-to-end without UI expression wiring. List-style nodes (`DriveListMyDrives`, `DriveListChildren`, `DriveListSharedWithMe`, `ExcelListWorksheets`) emit one item per record — the engine wraps each as `{ json: <record> }`.

  **Escape hatch**: when no built-in node fits, drop a Callback on the canvas, attach a Microsoft Graph credential to its `auth` slot, and use the re-exported `createGraphClient(session)` to get an authenticated Graph SDK client.

  **Microsoft Outlook / OneDrive / Excel SVG icons** added to the canvas builtin icon registry (`builtin:microsoft-outlook` etc.).

### Patch Changes

- [#109](https://github.com/MadeRelevant/codemation/pull/109) [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca) Thanks [@cblokland90](https://github.com/cblokland90)! - OAuth2 plugin authors can now declare `authorizeUrl` / `tokenUrl` (with `{publicFieldKey}` template substitution) directly on a credential type's `auth` definition — no core change required to add a new provider. Migrated `@codemation/core-nodes-msgraph` to use this for Microsoft tenant-templated URLs (fixes "Unsupported OAuth2 provider id: microsoft" on connect).

  Removed dead `@codemation/core-nodes-gmail` devDep from `@codemation/host` and the matching `serverExternalPackages` entry from `@codemation/next-host` so plugin-author `pnpm dev` no longer rebuilds gmail when working on an unrelated plugin.

  Softened the credentials UI's "Not set in host env: …" message: it's now an informational tip with neutral styling (was destructive/error styling), since the field works perfectly fine when filled in manually.

- [#108](https://github.com/MadeRelevant/codemation/pull/108) [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf) Thanks [@cblokland90](https://github.com/cblokland90)! - Plugin-author `pnpm dev` mode. Each plugin package now ships a `dev` script that builds the framework once via `turbo run build --filter='@codemation/next-host'` (Turbo caches subsequent runs) and then starts `codemation dev:plugin --plugin-root .` against the plugin's `codemation.plugin.ts`. No watchers on the framework. The previous `tsdown --watch` script is preserved as `dev:watch-bundle` for the rare case a downstream consumer needs the plugin's `dist/` rebuilt on save.

  Documented in `docs/development-modes.md` as "Plugin author mode". Recommended path for single-plugin work; `apps/plugin-dev` remains for cross-plugin scenarios.

- Updated dependencies [[`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c), [`6566d55`](https://github.com/MadeRelevant/codemation/commit/6566d55c829f6631357ac95052b0852e86092ac5), [`a77505f`](https://github.com/MadeRelevant/codemation/commit/a77505f331d7d3892f3c1c8f19dc37952b4d96bd), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`6fc7d3f`](https://github.com/MadeRelevant/codemation/commit/6fc7d3fe95f8d88386c16971fffa8dd3faa7704f), [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`3fe4213`](https://github.com/MadeRelevant/codemation/commit/3fe4213292bd0dd45af8de96d63e403dbc373b6b), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb)]:
  - @codemation/core@2.0.0
  - @codemation/host@1.1.0
