---
"@codemation/eslint-config": patch
---

`single-react-component-per-file` now allows component families. All exports sharing the filename-derived PascalCase prefix (e.g. `DropdownMenu*` in `dropdown-menu.tsx`) are treated as one family and allowed. Unrelated components in the same file still error. Rule extracted to `rules/single-react-component-per-file.mjs` with a test suite.
