# `@codemation/core-nodes-gmail`

Optional Gmail integration for Codemation. The package is intentionally trigger-first:

- a polling `OnNewGmailTrigger`
- Gmail OAuth credential registration
- an authenticated official Gmail client session for custom code and custom nodes
- workflow-facing Gmail action nodes for send, reply, and label updates
- attachment mapping for downstream OCR or parsing steps

## Install

```bash
pnpm add @codemation/core-nodes-gmail
```

The package exposes a root library API plus a `codemation.plugin.ts` discovery entry.

## Canonical imports

Use the package root:

```ts
import {
  GmailAttachmentMapping,
  ModifyGmailLabels,
  OnNewGmailTrigger,
  ReplyToGmailMessage,
  SendGmailMessage,
  type GmailSession,
  type OnNewGmailTriggerItemJson,
} from "@codemation/core-nodes-gmail";
```

## Trigger behavior

`OnNewGmailTrigger` polls Gmail and emits one workflow item per message. Each emitted `item.json` includes message metadata, headers, inline text/html bodies, and attachment descriptors. When `downloadAttachments: true` is enabled, binary attachments are attached to the same workflow item during trigger execution.

```ts
new OnNewGmailTrigger("On Inbox Mail", {
  mailbox: "ops@example.com",
  labelIds: ["Inbox"],
  query: "has:attachment newer_than:7d",
  downloadAttachments: true,
});
```

## Action nodes

For workflow authors, the package now exposes dedicated Gmail action nodes instead of helper-centric client wrappers:

- `SendGmailMessage`
- `ReplyToGmailMessage`
- `ModifyGmailLabels`

These nodes use the bound Gmail OAuth credential and keep the workflow graph declarative. They validate the current workflow item's `json` with node-specific `inputSchema`, so authors compose the Gmail payload in the normal workflow graph and then plug the action node in directly.

```ts
workflow
  .map("Build Gmail reply", (item) => ({
    messageId: item.json.messageId,
    text: "Thanks, we received your request.",
    attachments: [{ binaryName: "invoice_pdf" }],
  }))
  .then(new ReplyToGmailMessage("Reply to incoming message"));

workflow
  .map("Build label update", (item) => ({
    target: "thread",
    threadId: item.json.threadId,
    addLabels: ["Done"],
  }))
  .then(new ModifyGmailLabels("Mark Gmail thread done"));
```

Outgoing attachments are referenced by `binaryName` and read from `item.binary`; do not put file bytes or base64 bodies in `item.json`. Upstream Gmail triggers with `downloadAttachments: true` and custom nodes that call `ctx.binary.attach(...)` both produce the binary references these action nodes expect.

## Using the authenticated Gmail session

The Gmail OAuth credential session resolves to an authenticated session that exposes the official Gmail client:

```ts
const session = await ctx.getCredential<GmailSession>("auth");

await session.client.users.messages.send({
  userId: session.userId,
  requestBody: {
    raw: "base64url-encoded-rfc822-message",
  },
});
```

This is the recommended extension surface for custom consumer logic. The plugin keeps Gmail-specific runtime plumbing internal and lets custom code work directly with the official `googleapis` client.

## OAuth scopes

The default Gmail OAuth preset is `automation`. It requests the scopes needed for the trigger and the built-in Gmail action nodes:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/userinfo.email`

Supported preset values:

- `automation`: trigger, read, attachment download, send, reply, and label changes
- `readonly`: trigger, read, and attachment download only
- `custom`: replace the default scope bundle entirely with `customScopes`

Credential public config fields:

- `clientId`
- `scopePreset`
- `customScopes`

`customScopes` is only used when `scopePreset` is set to `custom`. The value may be comma-, space-, or newline-separated and replaces the default bundle instead of merging with it.

When scopes change, reconnect the credential so Google can grant the new consent set.

## Attachment helper

`GmailAttachmentMapping` converts trigger attachment descriptors into a downstream-friendly shape for OCR or parsing nodes:

```ts
const mapping = new GmailAttachmentMapping();
const attachments = mapping.toParseNodeAttachments(item);

// [{ filename, mimetype, binaryKey }]
```

This avoids every consumer app re-mapping `binaryName`, `mimeType`, and fallback filenames manually.

## Notes

- Service-account support has been removed from this plugin. Use the Gmail OAuth credential type.
- The package build emits real root entrypoints in `dist/index.*`, so Node ESM consumers can import the package root without workspace-only TS path aliases.
