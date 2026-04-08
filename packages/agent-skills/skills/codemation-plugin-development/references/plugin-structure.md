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

## Node guidance

- start with `defineNode(...)` and **`executeOne(...)`** for simple reusable nodes (per-item pipeline; optional **`mapInput`** / **`inputSchema`**)
- use `defineBatchNode(...)` only when the node must process the **whole activation batch** in one **`run(items, ...)`**
- keep runtime logic close to the node definition
- move to class-based node APIs when you need constructor-injected collaborators or deeper runtime metadata

## Credential guidance

- start with `defineCredential(...)`
- build typed sessions in `createSession(...)`
- implement `test(...)` so operators can validate configuration before activation

## Publishability

- keep the package build output and plugin entry explicit
- treat the plugin as a normal npm package
- installing the package in a Codemation app should be enough for the common auto-discovery flow
