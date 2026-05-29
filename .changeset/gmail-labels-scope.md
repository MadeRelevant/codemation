---
"@codemation/core-nodes-gmail": patch
---

fix(gmail): request the gmail.labels OAuth scope for label operations

The Gmail MCP server enforces a literal scope-name check. Label operations
(`create_label`, `label_message`, `label_thread`, `unlabel_*`) require
`gmail.labels`, which the semantic supersets `gmail.modify` / `gmail.send` do
not satisfy (they 403). Add `https://www.googleapis.com/auth/gmail.labels` to
the canonical scope set alongside `gmail.readonly` and `gmail.compose`.
