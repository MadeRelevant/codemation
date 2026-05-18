---
"@codemation/core": patch
"@codemation/host": patch
"@codemation/canvas-core": patch
---

fix: validate edge output ports against declared node ports at load time

Adds `WorkflowEdgePortValidator` to `@codemation/core`. The validator checks that every edge's `from.output` port is declared by the source node's `declaredOutputPorts`; nodes without declared ports are treated as unconstrained (legacy behaviour).

The validator is wired into `WorkflowDefinitionExportsResolver` in `@codemation/host`, which is the common chokepoint for both the `CodemationConsumerConfigLoader` and `CodemationConsumerAppResolver` load paths. On violation, all errors are reported at once so an agent can self-correct in a single pass.

`WorkflowElkPortInfoResolver` in `@codemation/canvas-core` is tightened to render _exactly_ the declared ports (plus the synthetic `error` port when applicable) when a node has `declaredOutputPorts`, preventing phantom handles from rogue edges on the canvas. Legacy nodes without declared ports continue to infer ports from edges as before.

Root cause: an LLM agent created an `If` workflow node (declares `["true", "false"]`) with a rogue edge using `output: "main"`, which the canvas unioned into the port list, producing a phantom third handle.
