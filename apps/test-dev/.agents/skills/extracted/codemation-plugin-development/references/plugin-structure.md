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

- start with `defineNode(...)` and **`execute(...)`** for simple reusable nodes (per-item pipeline; optional **`inputSchema`** and **`itemValue`** on config fields)
- use `defineBatchNode(...)` only when the node must process the **whole activation batch** in one **`run(items, ...)`**
- keep runtime logic close to the node definition
- move to class-based node APIs when you need constructor-injected collaborators or deeper runtime metadata

## Credential guidance

- start with `defineCredential(...)`
- build typed sessions in `createSession(...)`
- implement `test(...)` so operators can validate configuration before activation

## Publishability

- keep the package build output and plugin entry explicit
- point `package.json#codemation.plugin` at built JavaScript such as `./dist/codemation.plugin.js`
- do not rely on consumer runtimes TypeScript-loading plugin files from `node_modules`
- treat the plugin as a normal npm package
- installing the package in a Codemation app should be enough for the common auto-discovery flow
