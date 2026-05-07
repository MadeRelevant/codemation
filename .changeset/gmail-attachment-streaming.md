---
"@codemation/core-nodes-gmail": patch
---

Stream Gmail attachment downloads via `responseType: "stream"` + streaming JSON parser (`stream-json`) + chunked base64url decoder instead of materialising the full base64 string and decoded buffer in memory. `GmailMessageAttachmentContent.body` is now `AsyncIterable<Uint8Array>` (compatible with the `BinaryBody` union accepted by `ctx.binary.attach`).
