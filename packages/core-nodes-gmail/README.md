# `@codemation/core-nodes-gmail`

Gmail trigger node for Codemation. The **`OnNewGmailTrigger`** uses **simple polling** against the Gmail API (`users.messages.list` + `users.messages.get`): no Pub/Sub, no Gmail push/watch, and no GCP topic wiring.

## Plugin

Register `GmailNodes` in `codemation.config.ts`. Options:

| Option               | Default | Meaning                                     |
| -------------------- | ------- | ------------------------------------------- |
| `pollIntervalMs`     | `60000` | Time between polls (minimum `25` ms).       |
| `maxMessagesPerPoll` | `20`    | `maxResults` for each `messages.list` call. |

## Trigger configuration

| Field                 | Required | Notes                                                                        |
| --------------------- | -------- | ---------------------------------------------------------------------------- |
| `mailbox`             | Yes      | Service account: delegated user email. OAuth: often `"me"`.                  |
| `labelIds`            | No       | Label **names** or **ids** (must match Gmail). All must be on a message.     |
| `query`               | No       | Passed to Gmail `q` **and** client-side substring filter on headers/snippet. |
| `downloadAttachments` | No       | When `true`, attachments become item binaries in the execute step.           |

Each trigger item includes **inline MIME body** (`textPlain` / `textHtml`) when Gmail returns it with `messages.get` (`format: full`). Large bodies may only expose an `attachmentId`; use `downloadAttachments` for those files.

## How polling works

1. **First poll**: Lists up to `maxMessagesPerPoll` message ids and records them as **seen** without emitting (baseline).
2. **Later polls**: Any **new** id not in the seen set is loaded; items matching `labelIds` / `query` are emitted. Seen ids are capped (see `GmailPollingService`) to bound memory.

## Credentials

Same as before: `gmail.oauth` (readonly scope) or `gmail.serviceAccount` with domain-wide delegation. See `GmailNodesRegistry` for field shapes.

## See also

- Root `AGENTS.md` for monorepo conventions.
