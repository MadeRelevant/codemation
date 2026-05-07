---
"@codemation/core-nodes-msgraph": minor
---

Add `OutlookAttachmentDownload` node: downloads a single Outlook `fileAttachment` by id and stores its bytes in a named binary slot via `ctx.binary`. Falls back to `item.json.messageId`/`attachmentId` for zero-config chaining. Refuses `itemAttachment`/`referenceAttachment` with a clear error. Size cap (default 25 MiB) checked before decoding.
