---
name: strict-oop-di
description: Enforces strict OOP TypeScript standards with class-only modules, dependency-injection friendly design, and SOLID/DRY + Gang of Four patterns. Use when writing new code, creating new files/classes, refactoring, or reviewing changes for compliance.
---

# Strict OOP + DI (TypeScript)

## When to apply

Apply these rules whenever:
- new "host" / server code is written (next-host (ui) is more relaxed)
- new files/modules are created
- code is refactored
- changes are reviewed for quality/compliance

## Non‑negotiables (hard rules)

- **No top-level functions**: do not declare module-scope functions (no `function x(){}`, no `const x = () => {}` at module scope), and do not export functions.
  - Helpers must be **private methods** inside a class, or **private static methods** on a class.
- **Export surface is OOP**: modules should export **classes**, **types/interfaces**, and **tokens/constants** only.
- **DI-friendly always**:
  - No hidden singletons or global mutable state.
  - No importing concrete infrastructure inside core logic.
  - No `new`ing dependencies inside service/domain classes; dependencies arrive via **constructor injection**.
  - Prefer **class tokens** or **stable symbols** for DI resolution; avoid runtime string names.
  - Constructors should be cheap and side-effect free; do work in explicit methods (e.g. `execute`, `run`, `handle`).
- **Strict TypeScript**:
  - Avoid `any` (and `unknown` without narrowing).
  - Prefer explicit types at boundaries: public methods, exports, interfaces.
- **Composition over inheritance**: inheritance is rare; prefer delegation, decorators, and strategies.

## Repository boundaries (must stay true)

- `packages/core` stays pure (stable contracts + engine/runtime only).
- Node implementations live in node packages (plugins).
- Apps compose packages and wire the DI container.

## Default workflow (write code this way)

1. Identify responsibilities and seams (domain vs. orchestration vs. infrastructure).
2. Model seams as **interfaces** (ports) and **classes** (adapters/implementations).
3. Keep business rules in classes that depend only on abstractions.
4. Choose GoF patterns only where they remove duplication or isolate change.
5. Ensure new code can be registered/resolved by the DI container (constructor injection; stable tokens).

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

- **No top-level functions** exist in new/changed files.
- **No exported functions** exist in new/changed files.
- **All external effects** (time, IO, network, crypto, queues, persistence) are behind injected dependencies.
- **No concrete infra imports** inside core logic.
- **New code is testable** with in-memory or fake implementations (minimal mocking).
