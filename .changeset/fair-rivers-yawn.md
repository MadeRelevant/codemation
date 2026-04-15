---
"@codemation/core-nodes": patch
---

Preserve input binaries by default for `Split` and `Aggregate`.

- keep `binary` attachments on split fan-out items so downstream nodes do not silently lose files
- keep `binary` attachments on aggregate output items so batch reductions preserve the originating payload
