# Plugin Structure

## Minimal package shape

```text
codemation.plugin.ts
src/
  credentialTypes/
  nodes/
  index.ts
```

## Composition root

Use `codemation.plugin.ts` as the single place that:

- calls `definePlugin(...)`
- registers the plugin's credentials
- registers the plugin's nodes
- defines a small sandbox app through `defineCodemationApp(...)`

That file is the plugin repository's source composition root. Consumers should discover the plugin through `package.json#codemation.plugin`, pointing at built JavaScript in `dist/`.

## Node guidance

- start with `defineNode(...)` and **`execute(...)`** for simple reusable nodes (per-item pipeline; optional **`inputSchema`** and **`itemExpr`** on config fields)
- use `defineBatchNode(...)` only when the node must process the **whole activation batch** in one **`run(items, ...)`**
- keep runtime logic close to the node definition
- move to class-based node APIs when you need constructor-injected collaborators or deeper runtime metadata

## Credential guidance

- start with `defineCredential(...)`
- build typed sessions in `createSession(...)`
- implement `test(...)` so operators can validate configuration before activation
- for OAuth2 redirect flows, use the URL-template variant (`auth: { kind: "oauth2", providerId, authorizeUrl, tokenUrl, scopes }`) with `{publicFieldKey}` placeholders — no core or host edits needed per provider. See the credential-development skill for details.

## Polling-trigger guidance

- the engine ships a generic polling-trigger runtime in `@codemation/core` exposed via `ctx.polling` on the trigger setup context
- call `ctx.polling.start({ intervalMs, runCycle })` from your trigger node's `setup()` — the runtime handles the loop, overlap guard, dedup window (`ctx.polling.dedup.merge(...)`), state persistence, and cleanup
- on the first cycle, baseline-skip (record current ids, emit nothing) so the workflow does not flood with the existing backlog when the trigger is first set up
- implement `TestableTriggerNode.getTestItems(ctx)` to power the workflow UI's **Test** button — return the most recent N items without consulting or mutating polling state, so users can preview live data without waiting

## Publishability

- keep the package build output and plugin entry explicit
- point `package.json#codemation.plugin` at built JavaScript such as `./dist/codemation.plugin.js`
- do not rely on consumer runtimes TypeScript-loading plugin files from `node_modules`
- treat the plugin as a normal npm package
- installing the package in a Codemation app should be enough for the common auto-discovery flow
