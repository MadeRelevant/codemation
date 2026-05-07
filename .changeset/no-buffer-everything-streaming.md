---
"@codemation/core-nodes-msgraph": patch
"@codemation/core-nodes": patch
---

DriveDownload and OnNewMail now stream binary attachments directly into binary storage instead of buffering the entire payload in RAM (`Buffer.concat` / `Buffer.from(x, "base64")`). Functionally equivalent — only the memory profile improves (critical for multi-GB files).

Adds `codemation/no-buffer-everything` ESLint rule (error severity) to prevent future regressions: flags `Buffer.from(x,"base64")`, `.arrayBuffer()`, and `Buffer.concat()` with guidance on streaming alternatives. Genuine constraints (AES-GCM cipher, Graph upload requiring Content-Length, Excel workbook responses) are suppressed with justified `-- <reason>` comments.

Follow-up: support streaming multipart upload via the form-data package to remove the suppression in `HttpBodyBuilder`.
