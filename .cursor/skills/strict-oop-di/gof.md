## Gang of Four cheat-sheet (DI-first)

Use these patterns to remove duplication and isolate change. Default goal: **small classes, injected dependencies, no globals, no module-level functions**.

### Strategy

**Use when**: branching (`if/switch`) selects between algorithms.

**Rule of thumb**: if a conditional grows beyond ~3 branches or keeps changing, move to strategies.

**Structure**:

- `Strategy` interface
- one class per variant
- a selector/orchestrator (itself a class) that chooses the strategy

### Factory / Abstract Factory

**Use when**: construction is non-trivial, parameter-dependent, or requires runtime selection.

**DI-friendly shape**:

- Factory is a class injected where needed.
- Factory depends on abstractions and container-resolved constructors/providers.

### Adapter

**Use when**: integrating a vendor SDK or awkward API.

**DI-friendly shape**:

- Define a local interface (port) expressing what the app needs.
- Implement it with an adapter class that wraps the SDK client.
- Inject the adapter via the interface.

### Decorator

**Use when**: add behavior without changing a class (caching, retries, tracing, metrics).

**DI-friendly shape**:

- `Service` interface
- base implementation
- one or more decorators that wrap another `Service`
- wire ordering in the composition root / DI registration

### Command

**Use when**: actions need to be queued, retried, logged, or composed.

**DI-friendly shape**:

- `Command` interface: `execute()` (or `handle()`)
- each command has injected dependencies and immutable input
- commands are created by factories if input is dynamic

### Observer

**Use when**: publish/subscribe events without tight coupling.

**DI-friendly shape**:

- inject an `EventBus` interface; avoid global emitters
- handlers/subscribers are classes registered with the bus

### Template Method (sparingly)

**Use when**: a shared algorithm skeleton exists, with small overridable steps.

**Prefer**: Strategy + composition. Use inheritance only if it clearly reduces duplication and does not harm substitutability.

### Builder

**Use when**: complex object construction with many optional pieces.

**DI-friendly shape**:

- builder is a class; if it needs services, inject them
- keep the builder’s API fluent but typed
