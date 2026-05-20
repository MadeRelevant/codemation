---
"@codemation/host": minor
"@codemation/cli": minor
---

Runtime DI parity: hoist TypeInfo registrar into AppContainerFactory so CLI runs get the same DI graph as the HTTP host. Add codemation run workflow CLI command that dispatches StartWorkflowRunCommand and polls until terminal status.
