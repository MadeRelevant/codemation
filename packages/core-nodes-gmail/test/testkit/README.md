# Gmail Test Kit

Reusable helpers for `@codemation/core-nodes-gmail` unit tests.

## Exports

### `FakeGmailApiClient`

Implements `GmailApiClient` with in-memory stubs. Records all mutating calls:

- `.sendRequests` — args to `sendMessage()`
- `.replyRequests` — args to `replyToMessage()`
- `.messageLabelRequests` / `.threadLabelRequests` — args to label-modify calls

Read operations return sensible defaults (empty arrays, minimal records).

### `FakeGoogleGmailApiClientFactory`

Wraps `FakeGmailApiClient` and exposes it as a `create()` factory. Use when a production service needs a `GoogleGmailApiClientFactory`.

```ts
import { FakeGmailApiClient, FakeGoogleGmailApiClientFactory } from "./testkit/GmailTestKit";

const client = new FakeGmailApiClient();
const factory = new FakeGoogleGmailApiClientFactory(client);
const service = new GmailSendMessageService(factory);
```
