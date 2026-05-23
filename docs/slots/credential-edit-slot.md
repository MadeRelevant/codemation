# Credential Edit Slot — Control-Plane Override

## Overview

The workflow properties panel uses a pluggable slot (`renderCredentialBindings`) for all credential UI. The framework provides a default implementation (`NextHostCredentialBindingsRenderer`) that renders a select dropdown, "New credential" option, and "Edit" / "Bind" buttons. The control-plane can register its own implementation to provide a Connect-via-broker UI or custom OAuth flow.

---

## Current Implementation

### Slot interface

**File:** `packages/canvas-core/src/types/WorkflowCanvasConfig.ts:33-38`

```ts
export type NodeCredentialBindingsSlotProps = Readonly<{
  workflowId: string;
  node: WorkflowDiagramNode;
  pendingCredentialEditForNodeId: string | null;
  onConsumedPendingCredentialEdit: () => void;
}>;

// Registered on WorkflowCanvasConfig:
renderCredentialBindings?: (props: NodeCredentialBindingsSlotProps) => ReactNode;
```

### Canvas fallback guard

**File:** `packages/canvas/src/panels/NodeCredentialBindingsSection.tsx:9-22`

When `config.renderCredentialBindings` is not provided, the canvas renders a `CredentialUiNotConfiguredFallback` notice. Consumers must register their own implementation.

### Framework default implementation

**File:** `packages/next-host/src/features/workflows/canvas-adapter/NextHostCredentialBindingsRenderer.tsx`

Registered in `WorkflowDetailScreenPage.tsx:13-17`:

```tsx
const renderCredentialBindings = useCallback(
  (props: NodeCredentialBindingsSlotProps) => <NextHostCredentialBindingsRenderer {...props} />,
  [],
);
const config = useMemo((): WorkflowCanvasConfig => ({ renderCredentialBindings }), [renderCredentialBindings]);
```

### What NextHostCredentialBindingsRenderer does

1. Loads `workflowCredentialHealthQuery` and `credentialInstancesQuery` for the selected node.
2. Renders one `NodeCredentialBindingRow` per credential slot:
   - **Select dropdown**: lists compatible credential instances.
   - **"New credential"** option: opens `CredentialDialog` (create mode) with `openCreateDialog`.
   - **"Edit"** button: calls `openEditDialog(selectedCredentialInstance)` — reuses `CredentialDialog` in edit mode.
   - **"Bind"** button: calls `bindCredentialImpl` which PUTs to `/api/credential-bindings`.
3. Handles `pendingCredentialEditForNodeId`: when another part of the UI requests an edit for this node, finds the first slot with a bound instance and opens the edit dialog.

---

## What Is Broken

**User feedback:** "Edit credential from props panel doesn't work."

There are two distinct failure cases:

### Case 1 — Edit button is disabled for unbound slots

**File:** `packages/canvas/src/panels/NodeCredentialBindingRow.tsx:94,170`

```ts
const canEditCredential = Boolean(selectedCredentialInstance);
// ...
disabled={!canEditCredential}
```

The "Edit" button is disabled whenever no credential instance is selected. For freshly-created nodes or nodes where credentials have been removed, the user cannot reach the edit dialog at all. The expected UX would be to either show a "Connect" action or navigate to the credentials screen.

### Case 2 — `pendingCredentialEditForNodeId` no-ops when slot is unbound

**File:** `packages/next-host/src/features/workflows/canvas-adapter/NextHostCredentialBindingsRenderer.tsx:116-122`

```ts
const slotsWithInstance = nodeCredentialSlots.filter((slot) => slot.instance?.instanceId);
if (slotsWithInstance.length === 0) {
  pendingCredentialEditHandledRef.current = true;
  onConsumedPendingCredentialEdit();
  return; // ← does nothing, dialog never opens
}
```

When `requestOpenCredentialEditForNode` is called (e.g. from the canvas toolbar) and the node has no bound credential, the request is silently consumed.

### Case 3 — `CredentialDialog` is reused for edit (may not match control-plane expectations)

`openEditDialog` is designed for the framework's own `CredentialDialog`. A control-plane implementation likely wants to navigate to its own credential management UI (or launch an OAuth broker flow) rather than open the embedded dialog.

---

## Slot Interface for Control-Plane Override

The control-plane needs to register `renderCredentialBindings` on the `WorkflowCanvasConfig` passed to `WorkflowDetailScreen`. The slot receives:

| Prop                              | Type                  | Description                                                                                   |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `workflowId`                      | `string`              | Current workflow ID.                                                                          |
| `node`                            | `WorkflowDiagramNode` | Selected node (has `node.id`, `node.credentialRequirements`, etc.).                           |
| `pendingCredentialEditForNodeId`  | `string \| null`      | Set when a toolbar action requests credential edit for a specific node.                       |
| `onConsumedPendingCredentialEdit` | `() => void`          | **Must** be called when the pending edit request is handled (or abandoned) to reset the flag. |

### Minimum viable override

```tsx
function ControlPlaneCredentialBindings(props: NodeCredentialBindingsSlotProps) {
  const { workflowId, node, pendingCredentialEditForNodeId, onConsumedPendingCredentialEdit } = props;

  // Handle pending-edit requests from toolbar.
  useEffect(() => {
    if (pendingCredentialEditForNodeId !== node.id) return;
    // Open control-plane credential flow here.
    router.push(`/credentials?workflowId=${workflowId}&nodeId=${node.id}`);
    onConsumedPendingCredentialEdit();
  }, [pendingCredentialEditForNodeId, node.id, workflowId, onConsumedPendingCredentialEdit]);

  return (
    <section>
      {/* Render credential slot rows with Connect/Edit/Disconnect actions
          appropriate for the control-plane (OAuth broker, etc.) */}
    </section>
  );
}

// Registration:
const config: WorkflowCanvasConfig = {
  renderCredentialBindings: (props) => <ControlPlaneCredentialBindings {...props} />,
};
```

### What a control-plane implementation needs

1. **Query credential health**: import `useWorkflowCredentialHealthQuery(workflowId)` from `@codemation/canvas` to get the list of slots and their status.
2. **Read `WorkflowCredentialHealthSlotDto`** (from `@codemation/host/dto`) for each slot — provides `requirement.slotKey`, `requirement.acceptedTypes`, `instance`, `health.status`.
3. **Bind a credential**: PUT to `/api/credential-bindings` (see `NextHostCredentialBindingsRenderer.tsx:37` for the request shape: `UpsertCredentialBindingRequest`).
4. **Edit / connect flow**: navigate to the control-plane credential management page, or launch an OAuth broker flow. The framework does not prescribe the approach here.
5. **Call `onConsumedPendingCredentialEdit()`** whenever a pending edit request has been handled (even if the result is a no-op), to avoid the flag getting stuck.

---

## Files Referenced

| File                                                                                              | Role                                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/canvas-core/src/types/WorkflowCanvasConfig.ts:33-66`                                    | Slot type definition and `WorkflowCanvasConfig`                            |
| `packages/canvas/src/panels/NodeCredentialBindingsSection.tsx`                                    | Canvas dispatch: calls `config.renderCredentialBindings` or fallback       |
| `packages/canvas/src/panels/NodeCredentialBindingRow.tsx`                                         | Framework default row UI (Edit button, Select, Bind)                       |
| `packages/next-host/src/features/workflows/canvas-adapter/NextHostCredentialBindingsRenderer.tsx` | Framework default slot implementation                                      |
| `packages/next-host/src/features/workflows/screens/WorkflowDetailScreenPage.tsx:13-17`            | Where the slot is registered in next-host                                  |
| `packages/canvas-core/src/hooks/workflowDetail/useWorkflowInspectController.ts`                   | `requestOpenCredentialEditForNode` — sets `pendingCredentialEditForNodeId` |
