---
"@codemation/canvas": minor
"@codemation/next-host": patch
---

**Breaking (canvas):** `WorkflowCanvasConfig` gains a `renderCredentialBindings` slot. The canvas no longer imports from `@codemation/next-host`; the credential UI is a consumer responsibility.

**Migration:** Add `renderCredentialBindings` to your `WorkflowCanvasConfig`. Use `NextHostCredentialBindingsRenderer` from `@codemation/next-host/src/features/workflows/canvas-adapter/NextHostCredentialBindingsRenderer` to preserve the existing dropdown + create/edit dialog behavior. See `WorkflowDetailScreenPage.tsx` in next-host for an example.

If `renderCredentialBindings` is omitted, a small "Credential UI not configured" notice is shown in the inspector panel.
