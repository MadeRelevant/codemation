---
name: codemation-custom-node-development
description: Guides Codemation custom node development with `defineNode(...)` (`execute` per item), `defineBatchNode(...)` (batch `run`), reusable node modules, credential-aware nodes, and the class-based node fallback for advanced cases. Use when creating or updating custom nodes for apps or plugin packages.
compatibility: Designed for Codemation apps and plugin packages that define reusable nodes.
---

# Codemation Custom Node Development

## Use this skill when

Use this skill for reusable custom node work, whether the node lives inside an app or a published plugin package.

Do not use this skill for pure workflow chaining questions unless the node implementation itself is changing.

## Default approach

1. Start with `defineNode(...)`.
2. Implement **`execute(args, context)`** — one mapped **input** in, one output payload per item (activations are still batch-shaped; the engine iterates items for you).
3. Give the node a stable key and a clear title.
4. Optionally set **`icon`** on the `defineNode` definition so the workflow canvas shows a proper glyph (same string contract as `NodeConfigBase.icon`).
5. Use **`defineBatchNode(...)`** with **`run(items, context)`** only when the node must process the **entire batch** at once (legacy batch semantics).
6. Promote callback-heavy logic into a node when the graph or tests need a stronger boundary.

## Node rules

1. Prefer helper-based nodes first.
2. Keep nodes deterministic and focused.
3. Request credentials through named slots instead of hard-coded secrets.
4. Put **static** options (credentials, retry policy, labels) on **config**; put **per-item** behavior in **inputs** / wire JSON and optional **`itemExpr`** on config fields (consistent with built-in nodes).
5. **Emit files with `ctx.binary`, not base64 in `json`:** use **`attach`** + **`withAttachment`** on **`args.ctx.binary`** (`defineNode`) or **`ctx.binary`** (class nodes). Base64 in **`item.json`** bloats persisted run JSON in the database; binaries use **storage + references** only. See `references/node-patterns.md` and repo docs **Concepts → Execution model** / **Custom nodes**.
6. Drop to class-based node APIs only when you need constructor-injected collaborators, decorators, or deeper runtime metadata.

## Testing with `WorkflowTestKit`

For engine-backed tests without the host, use **`WorkflowTestKit`** from **`@codemation/core/testing`**: **`registerDefinedNodes([...])`**, then **`runNode`** or **`run`**. See the plugin development doc and `@codemation/core` tests for examples.

## Custom assertion + test nodes

When building **assertion** nodes that should record results into the framework's TestSuiteRun infrastructure, set **`emitsAssertions: true`** on the node config. The host's `TestSuiteRunTracker` listens for `nodeCompleted` events from runs with `ctx.testContext` set and persists each emitted item (matching the `AssertionResult` shape) as a `TestAssertion` row. Drop in a `defineNode` with a per-item `execute` that returns `AssertionResult[]` and you're done — no service injection required.

Custom **per-item nodes** can also read **`ctx.testContext?.{testSuiteRunId, testCaseIndex}`** to branch on test mode without an `IsTestRun` upstream — useful for synthetic outputs or skipping irreversible side effects when running tests.

## MS Graph: selective attachment download

Use `OutlookAttachmentDownload` from `@codemation/core-nodes-msgraph` when you have already
obtained attachment metadata (filename, contentType, id) and want to download only specific
attachments — e.g. after classifying them with an LLM step.

```ts
import { onNewMsGraphMailTrigger, outlookAttachmentDownloadNode } from "@codemation/core-nodes-msgraph";

// Trigger → filter in workflow DSL, then download only selected attachments:
workflow("wf.download-resumes")
  .trigger(onNewMsGraphMailTrigger, { mailbox: "me", folderId: "inbox" })
  // ... classify attachments upstream, pass messageId + attachmentId on item.json ...
  .then(
    outlookAttachmentDownloadNode.create(
      {
        // messageId / attachmentId fall back to item.json when left empty:
        messageId: "",
        attachmentId: "",
        binarySlot: "resume",
        sizeCapBytes: 10 * 1024 * 1024,
      },
      "DownloadResume",
    ),
  )
  // bytes are in item.binary["resume"]; item.json carries metadata:
  // { messageId, attachmentId, filename, contentType, size, isInline, contentId, binarySlot }
  .build();
```

Key constraints:

- Only `#microsoft.graph.fileAttachment` is supported — `itemAttachment` / `referenceAttachment` throw immediately.
- Set `keepBinaries: true` on any downstream node that needs to pass the binary slot forward.
- The credential is `msGraphMailOAuthCredentialType`; `Mail.Read` scope is sufficient.

## Read next when needed

- Read `references/node-patterns.md` for `defineNode(...)` patterns and packaging guidance.
- Use the `codemation-workflow-dsl` skill's `references/workflow-testing.md` for the full TestTrigger / IsTestRun / Assertion authoring story.
