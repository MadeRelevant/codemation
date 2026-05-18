---
"@codemation/examples": minor
---

Add per-node example coverage for all core nodes (Sprint 11 Story B).

New examples in `packages/examples/src/examples/`:

- `node-aiagent` — AIAgent with managed gateway + Zod outputSchema
- `node-httprequest` — GET + POST patterns with response metadata
- `node-filter` — predicate-based item filtering
- `node-mapdata` — field rename + derived values across two MapData steps
- `node-split` — array fan-out per element
- `node-aggregate` — reduce batch to single summary item
- `node-merge` — recombine If branches with append mode
- `node-wait` — fixed-duration pause for rate limiting
- `node-callback` — async side-effect handler with Items batch
- `node-istestrun` — guard live notifications in test mode
- `node-testtrigger-assertion` — TestTrigger + Assertion workflow testing primitive
- `node-subworkflow` — invoke reusable workflow by id per item
- `node-noop` — explicit sink/placeholder in branch
- `node-crontrigger` — hourly scheduled polling
- `node-webhooktrigger` — inbound HTTP with Zod inputSchema validation

Updates `packages/examples/docs/AUTHORING.md` with a "Node-focused vs scenario examples" section
explaining when to write each style.
