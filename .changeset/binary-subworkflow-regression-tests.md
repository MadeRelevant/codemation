---
"@codemation/core": patch
---

Add regression test suite confirming `item.binary` slots survive SubWorkflow boundaries in both directions (parent→child and child→parent), including stream readback of bytes across run boundaries. Document the shared-BinaryStorage pattern required for tests that call `ctx.binary.attach`.
