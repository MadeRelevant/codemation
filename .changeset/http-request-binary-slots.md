---
"@codemation/core-nodes": minor
---

feat(core-nodes): HttpRequest body and response support binary slots

- Add `responseFormat: "binary"` config field to store response bytes directly in `ctx.binary` rather than parsing as JSON/text. Output JSON carries `{ status, headers, binarySlot, contentType, size, filename }`.
- Add `responseBinarySlot?: string` (default `"response"`) and `responseSizeCapBytes?: number` (default 100 MiB, checked against `Content-Length` before allocating).
- Add `body: { kind: "binary", slot: string }` body spec to send raw bytes from a binary attachment slot as the request body. The attachment's `mimeType` is used as `Content-Type` unless an explicit header overrides it.
- Fix: explicit `headers["content-type"]` now correctly wins over the body-derived content type for all body kinds (was previously overwritten).
- Extract `HttpBodyBuilder.readStreamToBuffer` private helper to deduplicate stream-reading code shared between multipart and binary body kinds.
