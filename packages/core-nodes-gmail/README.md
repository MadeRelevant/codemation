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

These nodes use the bound Gmail OAuth credential and keep the workflow graph declarative. Their config is designed to work well with `itemValue(...)`, so authors can map recipients, subjects, message ids, and labels directly from upstream items instead of building ad hoc input payload objects.

```ts
import { itemValue } from "@codemation/core";

new SendGmailMessage("Send quote response", {
  to: itemValue(({ item }) => String((item.json as Record<string, unknown>)["from"] ?? "")),
  subject: itemValue(({ item }) => `Re: ${String((item.json as Record<string, unknown>)["subject"] ?? "")}`),
  text: "Thanks for your message. We will respond shortly.",
});

new ReplyToGmailMessage("Reply to incoming message", {
  messageId: itemValue(({ item }) => String((item.json as Record<string, unknown>)["messageId"] ?? "")),
  text: "Thanks, we received your request.",
});

new ModifyGmailLabels("Mark Gmail thread done", {
  target: "thread",
  threadId: itemValue(({ item }) => String((item.json as Record<string, unknown>)["threadId"] ?? "")),
  addLabels: ["Done"],
});
```

Each node resolves its config per item, so upstream mapping or AI nodes can feed Gmail actions without introducing a separate “compose input JSON for Gmail” step.

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
