---
"@codemation/core-nodes": minor
"@codemation/examples": minor
---

Reorganise examples package by kind (node/, scenario/, custom-pattern/) and extend HttpRequest credential API.

**`@codemation/core-nodes`**: `HttpRequest.credentialSlot` now accepts an object form `{ name: string; acceptedTypes?: ReadonlyArray<AnyCredentialType> }` in addition to the string shorthand. The object form narrows the credential types shown in the UI to the specified list. The string shorthand and the default four accepted types are fully backward-compatible.

**`@codemation/examples`**: Examples moved from the flat `src/examples/` directory into three subdirectories — `node/` (single-node focus), `scenario/` (multi-node use cases), and `custom-pattern/` (`defineRestNode`/`defineNode` templates). Discovery, verification, and metadata extraction are all updated to walk subdirectories recursively. New examples added: `node-httprequest-with-credential` (demonstrates the new `credentialSlot` object form) and `node-aiagent-with-tools` (demonstrates `AIAgent` with inline `callableTool` for tool-calling scenarios).
