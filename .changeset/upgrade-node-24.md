---
"create-codemation": minor
---

Bump minimum Node.js to 24 (latest LTS). CI workflows already run on Node 24; this aligns the published `engines.node` field. Also upgrade `dorny/paths-filter` from v3 to v4 to drop the deprecated Node 20 runtime.
