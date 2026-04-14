import type { CredentialFieldSchema, CredentialTypeDefinition } from "@codemation/core/browser";
import type {
  WorkflowCredentialHealthDto,
  WorkflowCredentialHealthSlotDto,
} from "@codemation/host-src/application/contracts/CredentialContractsRegistry";

import type { CredentialInstanceDto } from "../../../src/features/workflows/hooks/realtime/realtime";
import type { CredentialDialogOrderedField } from "../../../src/features/credentials/components/CredentialDialogFieldRowEntry";
import type { WorkflowDiagramNode } from "../../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";

/**
 * Minimal {@link CredentialTypeDefinition} for UI tests — spread overrides for field shapes.
 */
export function testCredentialTypeDefinition(
  overrides: Partial<CredentialTypeDefinition> & Pick<CredentialTypeDefinition, "typeId" | "displayName">,
): CredentialTypeDefinition {
  return {
    publicFields: [],
    secretFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    ...overrides,
  };
}

/** Gmail-style type used across workflow binding + dialog tests. */
export function testGmailOAuthCredentialType(): CredentialTypeDefinition {
  return testCredentialTypeDefinition({
    typeId: "gmail-oauth",
    displayName: "Gmail OAuth",
    publicFields: [],
    secretFields: [{ key: "token", label: "Token", type: "password", required: true }],
  });
}

export function testCredentialInstanceDto(
  overrides: Partial<CredentialInstanceDto> & Pick<CredentialInstanceDto, "instanceId" | "typeId">,
): CredentialInstanceDto {
  return {
    displayName: "Test instance",
    sourceKind: "db",
    publicConfig: {},
    tags: [],
    setupStatus: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function testWorkflowDiagramNode(overrides: Partial<WorkflowDiagramNode> = {}): WorkflowDiagramNode {
  return {
    id: "node-1",
    kind: "node",
    name: "Step",
    type: "MapData",
    ...overrides,
  };
}

export function testWorkflowCredentialHealthSlot(
  args: Readonly<{
    workflowId: string;
    nodeId: string;
    slotKey: string;
    label?: string;
    acceptedTypes: ReadonlyArray<string>;
    health: WorkflowCredentialHealthSlotDto["health"];
    instance?: WorkflowCredentialHealthSlotDto["instance"];
  }>,
): WorkflowCredentialHealthSlotDto {
  return {
    workflowId: args.workflowId,
    nodeId: args.nodeId,
    requirement: {
      slotKey: args.slotKey,
      label: args.label ?? "Mail",
      acceptedTypes: args.acceptedTypes,
    },
    health: args.health,
    ...(args.instance !== undefined ? { instance: args.instance } : {}),
  };
}

export function testWorkflowCredentialHealthDto(
  workflowId: string,
  slots: ReadonlyArray<WorkflowCredentialHealthSlotDto>,
): WorkflowCredentialHealthDto {
  return { workflowId, slots };
}

/** Matches {@link CredentialDialog}’s merged `orderedFields` entries. */
export function testPublicOrderedField(
  field: CredentialFieldSchema,
  fallbackIndex: number,
): CredentialDialogOrderedField {
  return {
    kind: "public",
    field,
    order: field.order ?? fallbackIndex,
  };
}

export function testSecretOrderedField(
  field: CredentialFieldSchema,
  fallbackIndex: number,
): CredentialDialogOrderedField {
  return {
    kind: "secret",
    field,
    order: field.order ?? fallbackIndex,
  };
}
