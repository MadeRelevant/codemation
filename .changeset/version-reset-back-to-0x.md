---
"@codemation/core": minor
"@codemation/core-nodes": minor
"@codemation/host": minor
---

Reset source version line back to 0.x. Earlier releases prematurely jumped these packages to 1.x and 2.x via silent `major` changesets buried under unrelated work; the framework is still in beta. The npm versions 1.x and 2.0.0 are deprecated upstream — consume the 0.x line going forward.

- `@codemation/core` 2.0.0 → 0.9.0 (continues from 0.8.1)
- `@codemation/core-nodes` 1.1.0 → 0.5.0 (continues from 0.4.3)
- `@codemation/host` 1.1.0 → 0.4.0 (continues from 0.3.1)

`@codemation/agent-skills`, `create-codemation`, `@codemation/cli`, and `@codemation/core-nodes-msgraph` already track 0.x and are unaffected.

`create-codemation` template dependency ranges updated from `1.x` to `0.x` to track the corrected line.
