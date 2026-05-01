---
"@codemation/core-nodes-gmail": minor
---

Make Gmail action nodes composable by moving per-call fields from constructor config into Zod-validated workflow item inputs.

`SendGmailMessage`, `ReplyToGmailMessage`, and `ModifyGmailLabels` now use `inputSchema` and read `args.input`, so constructors are `new SendGmailMessage(name, id?)`, `new ReplyToGmailMessage(name, id?)`, and `new ModifyGmailLabels(name, id?)`. Build the wire payload in an upstream step instead of using the old `{ fn: ... }` config wrappers:

```ts
.map("Build Gmail reply", (item, ctx) => ({
  messageId: ctx.data.getOutputItem("mail", 0)!.json.messageId,
  html: item.json.htmlBody,
  replyToSenderOnly: true,
  headers: item.json.bcc ? { Bcc: item.json.bcc } : undefined,
}))
.then(new ReplyToGmailMessage("Reply to sender"))
```

Outgoing attachments are now binary references only: pass `attachments: [{ binaryName: "quote", filename: "quote.pdf", mimeType: "application/pdf" }]` and ensure the current item has `item.binary.quote` (for example from `OnNewGmailTrigger` with `downloadAttachments: true`, or from a custom node using `ctx.binary.attach`). Inline `body: Uint8Array | string` attachments are no longer accepted, because storing file bytes or base64 in `item.json` bloats persisted run JSON in the database while binary attachments persist only storage references on the item.
