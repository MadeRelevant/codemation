# Builder Patterns

## Standard workflow shape

```ts
export default workflow("wf.example.id")
  .name("Example")
  .manualTrigger("Start", {
    step: "start",
  })
  .map("Transform", (item) => ({
    ...item,
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

## Inline callable agent tools

- import `callableTool` from `@codemation/core`
- build tools with `callableTool({ name, inputSchema, outputSchema, execute, credentialRequirements? })` (equivalent to `CallableToolFactory.callableTool(...)`)
- pass the result in `AIAgent` `tools: [...]` alongside other tool configs

## Fluent agent steps

- use `.agent(...)` for agent steps in fluent workflow definitions
- define agent prompts with `messages`
- use `itemValue(...)` when message content depends on `item.json`
- use `outputSchema` when the workflow should expose typed structured agent output
