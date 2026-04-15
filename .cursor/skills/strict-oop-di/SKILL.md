---
name: strict-oop-di
description: >-
  Codemation coding standards for this repo—apply on ANY code change: strict OOP
  TypeScript, DI, TDD, ≥80% coverage target, minimal mocking (real code and
  in-memory fakes preferred), outcome-based assertions (e.g. read-after-write),
  factories/testkits/harnesses for shared test setup (avoid brittle duplication),
  Clean Architecture for packages/core (engine), DDD/CQRS for packages/next-host,
  and SOLID/GoF patterns. Use when writing, refactoring, fixing bugs, adding
  tests, or reviewing changes in this codebase.
---

# Strict OOP + DI + TDD (TypeScript) — Codemation

## When to apply (always)

Apply this skill **whenever you touch production or test code** in this repository—including new files, refactors, features, bugfixes, and reviews. Do not treat it as “server-only”: tests and UI packages follow the same testing and assertion discipline (with repo-specific UI rules such as `data-testid` selectors).

For architectural boundaries and tooling, **`AGENTS.md`** remains the canonical reference; this skill adds **non‑negotiable testing and verification habits** that models must follow alongside OOP/DI rules.

## Non‑negotiables (hard rules)

### Code structure (OOP + DI)

- **No top-level functions**: do not declare module-scope functions (no `function x(){}`, no `const x = () => {}` at module scope), and do not export functions.
  - Helpers must be **private methods** inside a class, or **private static methods** on a class.
- **Export surface is OOP**: modules should export **classes**, **types/interfaces**, and **tokens/constants** only.
- **DI-friendly always**:
  - No hidden singletons or global mutable state.
  - No importing concrete infrastructure inside core logic.
  - No `new`ing dependencies inside service/domain classes; dependencies arrive via **constructor injection**.
  - Prefer **class tokens** or **stable symbols** for DI resolution; avoid runtime string names.
  - Constructors should be cheap and side-effect free; do work in explicit methods (e.g. `execute`, `run`, `handle`).
- **Packages that do not use tsyringe** (thin entrypoints such as **`@codemation/cli`**):
  - **No** requirement to mirror the host’s container: wire collaborators in **one composition-root module** (repo ESLint treats `*Factory.ts`, `Program.ts`, `*Bootstrap.ts`, `bin/*`, etc. as composition roots).
  - Keep **constructor injection** on commands, coordinators, and services; **do not** embed large default-parameter object graphs on the program class—**centralize** `new` wiring in that composition root.
  - **Do not** use this as an excuse to skip tests or to add hidden globals; it only relaxes **tsyringe/container parity**, not TDD or OOP export rules.
- **Strict TypeScript**:
  - Avoid `any` (and `unknown` without narrowing).
  - Prefer explicit types at boundaries: public methods, exports, interfaces.
- **Composition over inheritance**: inheritance is rare; prefer delegation, decorators, and strategies.

### Test-driven development (TDD)

- Prefer **red → green → refactor**: add or extend a **failing test** that expresses the desired behavior (or reproduces the bug), then implement the smallest change that passes, then refactor with tests green.
- For bugfixes, **lock the bug with a test first** when feasible so it cannot silently return.
- Do not merge behavior changes that have **no automated test** unless the team explicitly agreed on an untested exception (should be rare).

### Coverage target

- **Aim for at least ~80% coverage** on the code you add or materially change (package-appropriate: line/branch as reported by the repo’s Vitest/coverage setup).
- After substantive edits, run the relevant package or root **`pnpm run coverage`** (or the scoped test+coverage command for that package) and **do not introduce large untested gaps** without a concrete reason (e.g. generated code excluded by policy).
- If coverage drops on touched files, **add tests** or **refactor for testability** rather than lowering the bar.

### Mocking: use real behavior by default

- **Mocking is a last resort**, not a default. Prefer:
  - **Real implementations** wired through the same DI graph as production (integration-style tests where the repo provides harnesses).
  - **In-memory / fake implementations** of interfaces (ports) you own—see **`AGENTS.md`** (“Use interfaces + in-memory variants”).
- Reach for mocks/stubs **only when unavoidable**, for example:
  - **HTTP calls to third-party APIs** or other **external network** you must not hit in CI.
  - **Truly non-deterministic** or expensive integrations.
  - **Failure injection** that cannot be achieved with real code paths.
  - **Deterministic time** via an injected `Clock` (preferred over mocking timers when possible).
- This repo’s ESLint policy **forbids `vi.mock` / `vi.doMock`** in tests—use **DI fakes** and **save/restore** for globals (e.g. `fetch`) per **`AGENTS.md`**. Do not work around that with ad-hoc globals.

### Assertions: verify **outcomes**, not only HTTP status

- A **`200` / `201` / `204` alone is not enough** when the behavior under test is a **mutation** or **state change**.
- For **create/update/delete** flows (POST/PUT/PATCH/DELETE), **prove the system state** with a **follow-up read** (e.g. **GET** the resource, or query the store) and assert on **fields that must have changed** (and invariants that must not have broken).
- For **non-idempotent** or **async** effects, assert **eventual consistency** as appropriate (e.g. poll or wait until the read reflects the write), without weakening the assertion to “something returned OK”.
- Prefer assertions on **domain-meaningful data** (ids, flags, persisted fields) over **incidental** response shapes unless the contract under test is strictly the HTTP envelope.

### Test setup: factories, testkits, harnesses (DRY, refactor-safe)

- Do **not** repeat the same **object construction**, **wire-up**, and **scenario bootstrapping** across many tests. When setup drifts, tests become **brittle** and refactors require touching dozens of call sites.
- **Centralize** repeated setup in one of:
  - **Factories** / **builders** (test-only types that produce valid domain or DTO instances with sensible defaults and `.withX()`-style overrides where helpful).
  - **Testkits** (grouped helpers for a feature area: create user + credential + workflow in one call).
  - **Harnesses** (already common in this repo for HTTP/DB/integration: spin up app, DB, ports, and clients in a consistent way—reuse and extend them instead of inlining parallel setup).
- Prefer **classes** or **explicit modules** under `**/test/**` or `**/*test*` helper paths so setup stays discoverable and matches this repo’s OOP style; avoid scattering anonymous object literals that duplicate production defaults.
- When a third test copies the same “arrange” block, **extract** a factory or harness method instead of pasting again.
- Refactoring a constructor, API shape, or host bootstrap should ideally update **one factory/harness**, not **N** nearly identical tests.

## Repository boundaries (must stay true)

- **`packages/core`** stays **pure** (stable contracts + engine/runtime only)—elaborated under **Clean Architecture** below.
- Node implementations live in node packages (plugins).
- Apps compose packages and wire the DI container.

### Node outputs: batch `execute` vs `ItemNode` / `executeOne`

- **Batch nodes** implement **`Node.execute(items, ctx)`** (e.g. **`SplitNode`**, **`FilterNode`**, **`AggregateNode`**, merges, **`If`**, routers): you receive the batch and return **`NodeOutputs`** per port. Built-in **Split / Filter / Aggregate** reshape **`main`** (fan-out, predicate, batch→single summary)—see **`packages/core/docs/item-node-execution.md`**.
- **Per-item nodes** implement **`ItemNode`** with **`executeOne`** (e.g. **`MapDataNode`**, **`AIAgentNode`**): the engine runs **`executeOne` once per item** (serial, stable order today). **`inputSchema`** validates **`item.json` before enqueue**; optional **`itemExpr`** on config fields resolves **per item** before **`executeOne`** so templates can use **`item`** / **`ctx.data`**—same doc. **`RunnableNodeConfig<TIn, TOut, TWire>`** (third defaults to **`TIn`**) and **`ChainCursor.then`** type upstream wire JSON (**`TWire`**). Inside **`itemExpr`** callbacks, **`ctx.data`** (**`RunDataSnapshot`**) can read **any completed** node’s outputs in the run, not only the direct **`item`**.
- **Fluent DSL callback sugar** follows the same item contract for authoring: `.map(...)`, `.if(...)`, and `.switch({ resolveCaseKey })` receive **`(item, ctx)`**, so workflow rows live under **`item.json`** and prior completed outputs stay available through **`ctx.data`**.

### Node `execute()` → `NodeOutputs` (batch nodes)

When implementing **`Node.execute`**, return **`NodeOutputs`** whose **`Items` are what this node actually emits** on each port—not a standing pattern of “clone the input items and tuck the real output under an extra key”.

- **Treat each output item’s `json` as the node’s output payload** for downstream workflow steps (the shape implied by `RunnableNodeConfig<TIn, TOut>` / your exported output type; use **`TWire`** when upstream JSON differs from validated **`TIn`**). Avoid `json: { ...input, result: produced }` unless that nesting is **deliberately** the node’s API.
- **Enrichment nodes** may merge into a copy of input JSON (e.g. uppercase one field); **fetch / map / DTO nodes** should set **`json` to the produced value** (see **`HttpRequestOutputJson`** in core-nodes: metadata only, no pass-through of arbitrary input fields).
- Preserve **`binary` / `meta` / `paired`** when the feature needs them; do not use that as an excuse to wrap **`json`** unnecessarily.
- **Pass-through** (`return { main: items }`) is fine for no-op / routing behavior only—not as a lazy default for transforms.
- **Triggers follow the same contract**: emit **one `Item` per external event/record** (one email, one webhook request, one queue message). Do **not** hide many events inside `json: { results: [...] }`, `json: { foundItems: [...] }`, or similar wrapper objects. The batch is the array of `Items`; each `item.json` should be a single emitted domain record.

### `defineNode(...)` / `defineBatchNode(...)` (plugins)

- **`defineNode({ … })`** generates an **`ItemNode`**: implement **`executeOne(args, context)`** once per item. **`args`** includes **`input`** (after **`inputSchema`** parse), **`item`**, **`itemIndex`**, **`items`**, and **`ctx`**. **`context`** exposes **`config`** (with **`itemExpr`** leaves resolved), **`credentials`**, and **`execution`**. Optional **`inputSchema`** on the definition matches the engine’s Zod step; optional **`itemExpr`** on config fields matches the engine’s per-item resolution; **`TWireJson`** (third generic on **`RunnableNodeConfig`**) types upstream **`item.json`** for DSL wiring.
- **`defineBatchNode({ … })`** keeps the legacy batch contract: **`run(items, context)`** and classic **`Node.execute`** when a plugin node must see the **entire batch** in one shot (same escape hatch as class-based batch nodes).
- **Config vs inputs**: keep **credentials, retry policy, static options** on **config**; **per-item** query/API behavior belongs in **inputs** / wire JSON (and optional **`itemExpr`** on config fields), not duplicated as “config that changes every item.”
- Optional **`icon`** on either helper is forwarded to **`NodeConfigBase.icon`** (presentation only). Values follow the Next host canvas resolver (e.g. **`lucide:…`**, **`builtin:…`**, **`si:…`**, **`https:`** / **`data:`** / **`/…`**).

### `packages/core` (engine): Clean Architecture

- **Dependency rule (inward only)**: inner layers **must not** depend on outer layers. The engine’s **center** stays **framework-agnostic**: execution model, workflow DSL, stable **contracts** (types, ports), and orchestration that speaks in domain/engine terms—not HTTP, not UI, not persistence, not vendor SDKs, and not a concrete **node catalog** (nodes remain plugins).
- **Ports and adapters**: depend on **abstractions** (interfaces) at boundaries; **adapters** (concrete IO, integrations) belong **outside** the pure core—typically in **host** or **node packages** per **`AGENTS.md`**.
- **Use cases / engine flows**: express behavior as testable units that interact through **injected** ports; avoid “just import the implementation” for anything that touches the outside world.
- Do not weaken purity for convenience (no sneaking DB, `fetch`, or host-only types into `packages/core`).

### `packages/next-host`: DDD + CQRS

- **DDD**: organize features around **domain concepts** (workflows, credentials, runs, etc.); keep **names and models** aligned with how the product thinks about the problem (**ubiquitous language**). Prefer cohesive **feature modules** over a flat grab-bag of unrelated components and hooks.
- **CQRS**: **separate commands from queries**—**reads** (screens, lists, detail views, cached selectors) vs **writes** (create/update/delete, side effects). Do not collapse “load data for UI” and “perform a mutation” into one undifferentiated API surface when separate **query** vs **command** paths would be clearer (distinct hooks, handlers, types, or classes following existing package conventions).
- **Layering**: **presentation** (React, routing, layout) consumes **application-style** orchestration (hooks, small coordinators); **infrastructure** concerns (HTTP client details, env, browser-only APIs) stay at the **edge**, not inside purely visual components.
- Align with existing patterns in the package (e.g. React Query keys for reads, explicit mutations for writes) rather than inventing parallel ad-hoc state.

## Default workflow (write code this way)

1. Identify responsibilities and seams (domain vs. orchestration vs. infrastructure). In **core**, apply **Clean Architecture**; in **next-host**, apply **DDD** boundaries and **CQRS** where reads vs writes differ.
2. Model seams as **interfaces** (ports) and **classes** (adapters/implementations).
3. Keep business rules in classes that depend only on abstractions.
4. Choose GoF patterns only where they remove duplication or isolate change.
5. **Where the package uses tsyringe** (e.g. engine/host bootstrap): register/resolve via the container. **Otherwise**: wire dependencies in a composition-root file (Factory/Program/Bootstrap) with constructor-injected collaborators—no container required.
6. **Write or update tests first** (TDD), then implement; finish with **coverage** and **outcome-level assertions**.
7. **Reuse factories, testkits, and harnesses** for arrange/setup; add new shared helpers when duplication appears.

## Minimal templates (copy + adapt)

### Service with injected ports (no module-level functions)

```ts
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export interface UserStore {
  getById(id: string): Promise<User | null>;
}

export type User = { id: string; email: string };

export class UserService {
  constructor(
    private readonly userStore: UserStore,
    private readonly clock: Clock,
  ) {}

  async getUser(id: string): Promise<{ user: User; fetchedAt: Date } | null> {
    const user = await this.userStore.getById(id);
    if (!user) return null;
    return { user, fetchedAt: this.clock.now() };
  }
}
```

### Strategy pattern (replace branching with polymorphism)

```ts
export interface PricingStrategy {
  price(input: PriceInput): Money;
}

export type Money = { currency: "USD" | "EUR"; cents: number };
export type PriceInput = { plan: "free" | "pro"; seats: number };

export class ProPricing implements PricingStrategy {
  price(input: PriceInput): Money {
    return { currency: "USD", cents: input.seats * 2000 };
  }
}

export class FreePricing implements PricingStrategy {
  price(_: PriceInput): Money {
    return { currency: "USD", cents: 0 };
  }
}
```

## SOLID / DRY checklist (use for refactors and reviews)

- **S (Single Responsibility)**: each class has one reason to change; split orchestration vs. domain rules vs. infrastructure adapters.
- **O (Open/Closed)**: add new behavior by adding a new class (strategy/decorator/handler) rather than editing big `switch` blocks.
- **L (Liskov)**: substitutable implementations; do not strengthen preconditions or weaken postconditions in derived types.
- **I (Interface Segregation)**: small, focused interfaces; avoid “god interfaces”.
- **D (Dependency Inversion)**: high-level code depends on abstractions; concrete implementations sit at the edge and are injected.
- **DRY**: eliminate duplication via extraction into classes/policies/strategies (not module functions).

## Gang of Four patterns (default mapping)

Use these patterns as the first options for typical pressures:

- **Strategy**: conditional algorithm variants.
- **Factory / Abstract Factory**: complex creation logic; avoid `new` spread across the codebase.
- **Adapter**: wrap vendor SDKs / infra clients behind local interfaces.
- **Decorator**: cross-cutting behavior (caching, retry, tracing) without subclassing.
- **Command**: represent actions/jobs as objects (enqueue, retry, audit).
- **Observer**: eventing via an injected event bus (avoid globals).

For more detailed guidance and examples, see `gof.md`.

## Review gates (reject if violated)

- **No top-level functions** exist in new/changed files (unless repo tooling explicitly exempts the file).
- **No exported functions** exist in new/changed files (same caveat).
- **All external effects** (time, IO, network, crypto, queues, persistence) are behind injected dependencies (or composed only in an explicit composition root for thin packages that do not use tsyringe).
- **No concrete infra imports** inside core logic.
- **Tests exist** for new behavior or regressions; **TDD** was used where practical.
- **Coverage**: changed areas are not left largely untested; **~80%** target is met for new/changed code where feasible.
- **Mocks** are not used to “fake” what could be an in-memory implementation or real path; **mocks only where necessary** (e.g. outbound HTTP to third parties).
- **Mutations are verified** with **read-after-write** (or equivalent), not **status-code-only** assertions.
- **New code is testable** with in-memory or fake implementations (minimal mocking).
- **Repeated test setup** is not copy-pasted across files; **factories / testkits / harnesses** own shared arrange logic so refactors do not require sweeping edits to brittle literals.
- **`packages/core`**: **Clean Architecture** dependency rule preserved—no outer-layer or infrastructure leaks into the engine.
- **`packages/next-host`**: **DDD** naming/cohesion and **CQRS**-style **command vs query** separation are respected for new or refactored features.
- **Node `execute`**: output **`json`** is the **produced payload** for downstream steps, not a redundant wrapper around input + result (unless that nested shape is the intentional API)—see **Node `execute()` → `NodeOutputs`** above.
