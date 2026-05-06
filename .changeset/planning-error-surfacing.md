---
"@codemation/core": patch
---

Surface workflow-planning errors in the node inspector instead of swallowing them as `[codemation-http] unhandled route error`. When `NodeInstanceFactory` fails to instantiate a node (e.g. tsyringe `TypeInfo not known` for a constructor param), the offending `nodeId` is preserved via a new `NodeInstantiationError`, and `RunStartService` now persists a failed run with the error attached to that node — same shape execution errors already use, so the UI shows `name`/`message`/`stack` in the node "output" panel.
