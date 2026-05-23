Load this when you need item-flow rules, the two-API decision, and fluent authoring patterns.

# Builder Patterns

## Manual-trigger workflow (fluent — full sugar available)

```ts
import { workflow } from "@codemation/host";

export default workflow("wf.example.id")
  .name("Example")
  .manualTrigger("Start", { step: "start" })
  .map("Transform", (item, _ctx) => ({
    ...item.json,
    transformed: true,
  }))
  .build();
```

The `.map`, `.if`, `.switch`, `.split`, `.agent`, `.node`, `.then` helpers are available because `manualTrigger(...)` returns a `WorkflowChain`.

## Cron-triggered workflow (low-level — `.then(new NodeConfig(...))` only)

```ts
import { Callback, CronTrigger, createWorkflowBuilder } from "@codemation/core-nodes";

export default createWorkflowBuilder({
  id: "wf.nightly.id",
  name: "Nightly job",
})
  .trigger(new CronTrigger("Nightly", { schedule: "0 3 * * *", timezone: "Europe/Amsterdam" }))
  .then(
    new Callback("Process tick", (items, _ctx) => {
      // Callback receives the whole batch (Items), not a single item.
      // For a cron trigger the batch is always one item: { firedAt, scheduledFor }.
      return items.map((item) => ({ firedAt: (item.json as { firedAt: string }).firedAt }));
    }),
  )
  .build();
```

The cron expression is validated at workflow build time. Each tick emits one item with `{ firedAt, scheduledFor }` ISO-8601 strings. Always supply `timezone` for DST-sensitive schedules — defaults to UTC.

**Note:** non-manual triggers do NOT give you `.map(...)` / `.if(...)` / `.agent(...)` sugar. Compose with `.then(new Callback(...))`, `.then(new If(...))`, `.then(new AIAgent({...}))`, etc.

## Webhook-triggered workflow

```ts
import { WebhookTrigger, createWorkflowBuilder, Callback } from "@codemation/core-nodes";

export default createWorkflowBuilder({
  id: "wf.webhook.example",
  name: "Webhook example",
})
  .trigger(new WebhookTrigger("Incoming", { endpointKey: "inbound", methods: ["POST"] }))
  .then(new Callback("Handle payload", (items) => items.map((it) => ({ received: it.json }))))
  .build();
```

## Decision rule

- **Manual one-shot trigger?** Use `workflow("id").manualTrigger(...)` — short, fluent, full sugar.
- **Anything else?** Use `createWorkflowBuilder({ id, name }).trigger(new Trigger(...))` — verbose, node-config style.

## Imports cheat sheet

- `workflow` → `@codemation/host` (re-exports from `@codemation/core-nodes`)
- `createWorkflowBuilder`, `CronTrigger`, `WebhookTrigger`, `Callback`, `HttpRequest`, `AIAgent`, `If`, `Split`, `Merge`, `SubWorkflow` → `@codemation/core-nodes`
- `callableTool`, `itemExpr` → `@codemation/core`
- Workflow file location: `src/workflows/`. Export the built definition as the default export.

## Item rules

- workflow data flows as items
- items usually carry `json` data and optional `binary` data (**storage-backed attachments** via node **`ctx.binary.attach`**, not huge base64 strings in **`json`** — base64 in **`json`** inflates the persisted run payload in the DB; binaries stay as **references**)
- runtime nodes receive batches of items, not just one record
- author workflow steps with batching in mind
- fluent `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` callbacks receive `(item, ctx)`
- read row fields from `item.json` and earlier completed outputs from `ctx.data`

## Node id assignment

When no `id:` is provided, the builder slugifies the node's `name` label: lowercase, non-alphanumeric runs replaced with `-`, leading/trailing `-` stripped. Two nodes with the same effective label produce the same slug and `.build()` throws `WorkflowDefinitionError`. Fix: provide a unique `id:` on the colliding node configs.

Credential bindings are stored as `(workflowId, nodeId, slotKey)`. Changing a node's label changes its slug-derived id and the binding appears unbound. For credential-using nodes, either keep the label stable or set an explicit `id:`:

```ts
.node("Send email", SendEmailNodeConfig, {
  id: "send-email", // stable even after a label rename
  credentials: { smtp: mySmtpCredential },
})
```

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
- use `itemExpr(...)` when message content depends on `item.json`
- use `outputSchema` when the workflow should expose typed structured agent output
