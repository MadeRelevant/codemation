import { node } from "@codemation/core";
import { MissingRuntimeTriggerToken } from "@codemation/core/bootstrap";
import type {
  WorkflowCredentialHealthDto,
  WorkflowCredentialHealthSlotDto,
} from "../../src/application/contracts/CredentialContractsRegistry";
import { WorkflowActivationPreflightRules } from "../../src/domain/workflows/WorkflowActivationPreflightRules";
import { createWorkflowBuilder, ManualTrigger, WebhookTrigger } from "@codemation/core-nodes";
import { describe, expect, it } from "vitest";

/** Simulates a second physical class for the same logical type (duplicate package instance). */
@node({ name: "ManualTriggerNode", packageName: "@test/activation-alias" })
class ManualTriggerAliasToken {}

describe("WorkflowActivationPreflightRules", () => {
  const rules = new WorkflowActivationPreflightRules();

  it("returns no trigger errors when a non-manual trigger exists", () => {
    const workflow = createWorkflowBuilder({ id: "w1", name: "W" })
      .trigger(new WebhookTrigger("Hook", { endpointKey: "a", methods: ["POST"] }, undefined, "h"))
      .build();
    expect(rules.collectNonManualTriggerErrors(workflow)).toEqual([]);
  });

  it("errors when the workflow has no trigger nodes", () => {
    const workflow = createWorkflowBuilder({ id: "w1", name: "W" }).build();
    expect(rules.collectNonManualTriggerErrors(workflow).length).toBeGreaterThan(0);
  });

  it("errors when only a manual trigger is present", () => {
    const workflow = createWorkflowBuilder({ id: "w1", name: "W" }).trigger(new ManualTrigger("Manual", "m")).build();
    const messages = rules.collectNonManualTriggerErrors(workflow);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("manual");
  });

  it("treats manual triggers consistently when the runtime type token is a different class with the same persisted name", () => {
    const base = createWorkflowBuilder({ id: "w1", name: "W" }).trigger(new ManualTrigger("Manual", "m")).build();
    const aliasWorkflow = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.kind === "trigger" ? { ...n, type: ManualTriggerAliasToken as unknown as typeof n.type } : n,
      ),
    };
    const messages = rules.collectNonManualTriggerErrors(aliasWorkflow);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("manual");
  });

  it("errors when only a missing-runtime trigger placeholder is present", () => {
    const workflow = createWorkflowBuilder({ id: "w1", name: "W" }).build();
    const withPlaceholder = {
      ...workflow,
      nodes: [
        {
          id: "t",
          kind: "trigger" as const,
          type: MissingRuntimeTriggerToken,
          name: "Missing",
          config: {} as never,
        },
      ],
    };
    const messages = rules.collectNonManualTriggerErrors(withPlaceholder);
    expect(messages.length).toBe(1);
  });

  it("collects required credential slot errors for unbound required slots", () => {
    const health: WorkflowCredentialHealthDto = {
      workflowId: "w1",
      slots: [
        {
          workflowId: "w1",
          nodeId: "n1",
          nodeName: "Node A",
          requirement: { slotKey: "api", label: "API key", acceptedTypes: ["openai"] },
          health: { status: "unbound" },
        },
        {
          workflowId: "w1",
          nodeId: "n2",
          nodeName: "Node B",
          requirement: { slotKey: "opt", label: "Optional", acceptedTypes: ["openai"], optional: true },
          health: { status: "optional-unbound" },
        },
      ],
    };
    const messages = rules.collectRequiredCredentialErrors(health);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("API key");
    expect(messages[0]).toContain("Node A");
  });

  it("ignores optional unbound slots", () => {
    const health: WorkflowCredentialHealthDto = {
      workflowId: "w1",
      slots: [
        {
          workflowId: "w1",
          nodeId: "n1",
          requirement: { slotKey: "opt", label: "Optional", acceptedTypes: ["x"], optional: true },
          health: { status: "unbound" },
        },
      ],
    };
    expect(rules.collectRequiredCredentialErrors(health)).toEqual([]);
  });

  describe("collectScopeMismatchErrors", () => {
    function boundSlot(overrides: Partial<WorkflowCredentialHealthSlotDto> = {}): WorkflowCredentialHealthSlotDto {
      return {
        workflowId: "w1",
        nodeId: "n1",
        nodeName: "Gmail Node",
        requirement: { slotKey: "gmail", label: "Gmail", acceptedTypes: ["oauth.google.gmail"] },
        instance: { instanceId: "inst-1", typeId: "oauth.google.gmail", displayName: "My Gmail", setupStatus: "ready" },
        health: { status: "healthy" },
        ...overrides,
      };
    }

    it("returns [] when granted scopes are a superset of required scopes", async () => {
      const health: WorkflowCredentialHealthDto = { workflowId: "w1", slots: [boundSlot()] };
      const errors = await rules.collectScopeMismatchErrors(health, {
        getRequiredScopes: () => ["https://mail.google.com/"],
        getGrantedScopes: async () => ["https://mail.google.com/", "https://www.googleapis.com/auth/gmail.send"],
      });
      expect(errors).toEqual([]);
    });

    it("returns an error when a required scope is missing", async () => {
      const health: WorkflowCredentialHealthDto = { workflowId: "w1", slots: [boundSlot()] };
      const errors = await rules.collectScopeMismatchErrors(health, {
        getRequiredScopes: () => ["https://mail.google.com/", "https://www.googleapis.com/auth/gmail.send"],
        getGrantedScopes: async () => ["https://mail.google.com/"],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("My Gmail");
      expect(errors[0]).toContain("https://www.googleapis.com/auth/gmail.send");
      expect(errors[0]).toContain("Reconnect");
    });

    it("skips unbound slots", async () => {
      const health: WorkflowCredentialHealthDto = {
        workflowId: "w1",
        slots: [
          {
            workflowId: "w1",
            nodeId: "n1",
            requirement: { slotKey: "gmail", label: "Gmail", acceptedTypes: ["oauth.google.gmail"] },
            health: { status: "unbound" },
          },
        ],
      };
      const errors = await rules.collectScopeMismatchErrors(health, {
        getRequiredScopes: () => ["https://mail.google.com/"],
        getGrantedScopes: async () => [],
      });
      expect(errors).toEqual([]);
    });

    it("skips non-OAuth types when getRequiredScopes returns []", async () => {
      const health: WorkflowCredentialHealthDto = { workflowId: "w1", slots: [boundSlot()] };
      const errors = await rules.collectScopeMismatchErrors(health, {
        getRequiredScopes: () => [],
        getGrantedScopes: async () => [],
      });
      expect(errors).toEqual([]);
    });

    it("deduplicates when two slots share the same instanceId", async () => {
      const slot1 = boundSlot({ nodeId: "n1" });
      const slot2 = boundSlot({ nodeId: "n2" });
      const health: WorkflowCredentialHealthDto = { workflowId: "w1", slots: [slot1, slot2] };
      const errors = await rules.collectScopeMismatchErrors(health, {
        getRequiredScopes: () => ["https://mail.google.com/"],
        getGrantedScopes: async () => [],
      });
      expect(errors).toHaveLength(1);
    });

    it("treats missing OAuth material (empty granted scopes) as no scopes granted", async () => {
      const health: WorkflowCredentialHealthDto = { workflowId: "w1", slots: [boundSlot()] };
      const errors = await rules.collectScopeMismatchErrors(health, {
        getRequiredScopes: () => ["https://mail.google.com/"],
        getGrantedScopes: async () => [],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("My Gmail");
      expect(errors[0]).toContain("Reconnect");
    });
  });
});
