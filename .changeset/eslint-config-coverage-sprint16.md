---
"@codemation/eslint-config": patch
---

test(eslint-config): push tooling/eslint-config coverage to ≥90% (Sprint 16 Story 01 — eslint-config work unit)

Add per-package vitest.config.mjs with coverage.all: true and include: rules/\*_/_.mjs so
uncovered rule files cannot silently inflate the percentage. Add targeted tests for:

- Computed-property call expression (isMemoOrForwardRefCall line-40 fallthrough)
- Two bare-Component class components in one file (class-component detection)
- Mixed class + memo-wrapped components in one file (class + memo interaction)

Lines coverage: 95.5% (up from 94.38% per rules/\*.mjs baseline). Dead-code branches on lines 70-71
(export-default VariableDeclaration, invalid JS syntax) and 141-142 (FunctionDeclaration inside
ExportDefaultDeclaration, structurally unreachable) are documented but excluded from threshold.
