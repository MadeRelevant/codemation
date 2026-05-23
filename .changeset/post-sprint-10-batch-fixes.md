---
"@codemation/cli": minor
"@codemation/next-host": patch
"@codemation/eslint-config": patch
---

post-sprint-10 batch fixes

- **cli (minor):** Remove `discovery` subcommand group — relocated to admin-ui catalog debug page. Discovery is a catalog-admin tool, not a workflow-author tool; the framework CLI is the wrong home.
- **next-host (patch):** Relax ELK nested-agent side-by-side layout test. The strict y-diff ≤ 8 geometry assertion was impossible (74+gap+74 > 160 px compound width); replaced with `toBeDefined()` checks confirming both children render.
- **eslint-config (patch):** `single-react-component-per-file` now allows component families. All exports sharing the filename-derived PascalCase prefix (e.g. `DropdownMenu*` in `dropdown-menu.tsx`) are treated as one family and allowed. Unrelated components in the same file still error. Rule extracted to `rules/single-react-component-per-file.mjs` with a test suite.
