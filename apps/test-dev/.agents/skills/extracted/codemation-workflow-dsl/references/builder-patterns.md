# Builder Patterns

## Standard workflow shape

```ts
export default workflow("wf.example.id")
  .name("Example")
  .manualTrigger("Start", {
    step: "start",
  })
  .map("Transform", (item, _ctx) => ({
    ...item.json,
    transformed: true,
  }))
  .build();
```

## Use the fluent DSL by default

- import `workflow` from `@codemation/host`
- keep the file under `src/workflows`
- export the built workflow definition as the default export when following starter patterns

## Item rules

- workflow data flows as items
- items usually carry `json` data and optional `binary` data
- runtime nodes receive batches of items, not just one record
- author workflow steps with batching in mind
- fluent `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` callbacks receive `(item, ctx)`
- read row fields from `item.json` and earlier completed outputs from `ctx.data`

## When to move beyond callbacks

Promote inline callbacks into custom nodes when:

- the logic is reused across workflows
- the workflow graph needs clearer names
- credentials or collaborators need explicit boundaries
- the callback has become hard to test in isolation

## Relationship to the engine

- the fluent DSL is the friendly authoring surface
- `@codemation/core` still owns planning, execution, continuation, and runtime contracts
- host and node packages add the surrounding product capabilities
