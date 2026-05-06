---
"create-codemation": patch
---

Ship the previously-merged template dependency fix (`@codemation/core`, `@codemation/core-nodes`, `@codemation/host` ranges flipped from `1.x` → `0.x`) as a published version. The fix landed in the source tree but `create-codemation` itself wasn't included in that release's changeset frontmatter, so npm still serves the stale template pins on `create-codemation@0.1.0`.
