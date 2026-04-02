# Codemation plugin starter

This template scaffolds a plugin package around `codemation.plugin.ts`.

1. `pnpm install`
2. `pnpm dev`
3. Open the printed local URL to inspect the sandbox app.
4. Create an **Example API key** credential (any non-empty secret works) and bind it to the sample node’s slot so the HTTP demo can run.

What you get:

- `codemation.plugin.ts` with `definePlugin(...)` and `SandboxFactory.create(...)` for a typed local-dev sandbox
- a sample credential type in `src/credentialTypes`
- a sample custom node that performs an HTTP request and sends the credential on the wire (`src/nodes`)
- a sandbox workflow that exercises the custom node immediately

## Publishing and discovery

Run `pnpm build`, publish the package to npm, then add it as a dependency of your Codemation consumer app. Discovery is driven by `package.json`:

```json
{
  "name": "@acme/codemation-plugin-hello",
  "codemation": {
    "plugin": { "kind": "plugin", "entry": "./dist/codemation.plugin.js" }
  }
}
```

After `pnpm install` in the consumer, the host loads `./node_modules/@acme/codemation-plugin-hello/dist/codemation.plugin.js` (the `entry` path) and registers the exported plugin alongside your app config.
