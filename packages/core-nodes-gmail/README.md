# `@codemation/core-nodes-gmail`

Optional Gmail integration for Codemation. It provides:

- a polling `OnNewGmailTrigger`
- OAuth credential registration for Gmail
- an authenticated official Gmail client session for custom nodes and apps
- higher-level Gmail helpers for send, reply, label updates, MIME building, and attachment mapping

## Install

```bash
pnpm add @codemation/core-nodes-gmail
```

The package exposes both a root library API and a `codemation.plugin.ts` discovery entry.

## Canonical imports

Use the package root:

```ts
import {
  GmailAttachmentMapping,
  GoogleGmailApiClient,
  OnNewGmailTrigger,
  type GmailSession,
  type OnNewGmailTriggerItemJson,
} from "@codemation/core-nodes-gmail";
```

## Trigger behavior

`OnNewGmailTrigger` polls Gmail and emits one workflow item per message. Each emitted `item.json` includes message metadata, headers, inline text/html bodies, and attachment descriptors. When `downloadAttachments: true` is enabled, binary attachments are attached to the same workflow item during trigger execution.

Example:

```ts
new OnNewGmailTrigger("On Inbox Mail", {
  mailbox: "ops@example.com",
  labelIds: ["Inbox"],
  query: "has:attachment newer_than:7d",
  downloadAttachments: true,
});
```

## OAuth scopes

The default Gmail OAuth preset is `automation`. It requests the scopes needed for every feature this plugin currently supports:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/userinfo.email`

Supported preset values:

- `automation`: trigger, read, download attachments, send, reply, and label changes
- `readonly`: trigger, read, and attachment download only
- `custom`: replace the default scope bundle entirely with `customScopes`

Credential public config fields:

- `clientId`
- `scopePreset`
- `customScopes`

`customScopes` is only used when `scopePreset` is set to `custom`. The value may be comma-, space-, or newline-separated and replaces the default bundle instead of merging with it.

When scopes change, reconnect the credential so Google can grant the new consent set.

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

For common automation, you can use the exported helper instead of hand-building MIME:

```ts
const session = await ctx.getCredential<GmailSession>("auth");
const gmail = new GoogleGmailApiClientFactory().create(session);

await gmail.sendMessage({
  to: ["buyer@example.com"],
  subject: "Quote response",
  text: "Thanks for the RFQ. We will reply shortly.",
});

await gmail.replyToMessage({
  messageId: "gmail-message-id",
  text: "Thanks, we received your request.",
});

await gmail.modifyMessageLabels({
  messageId: "gmail-message-id",
  addLabelIds: ["Label_done"],
  removeLabelIds: ["INBOX"],
});
```

`GoogleGmailApiClient` keeps the read surface used by the trigger and adds:

- `sendMessage(...)`
- `sendRawMessage(...)`
- `replyToMessage(...)`
- `modifyMessageLabels(...)`
- `modifyThreadLabels(...)`

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
