---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/next-host": patch
---

Add fluent workflow authoring support for port routing and core nodes.

- `workflow()` DSL: add `route(...)`, `merge(...)`, and `switch(...)` helpers so multi-port graphs can be expressed without manual `edges`.
- `Callback`: allow returning `emitPorts(...)` and configuring declared output ports and error handling options.
- Next host: fix execution inspector tree nesting by preferring `snapshot.parent.nodeId` when available (nested agent/tool invocations).
