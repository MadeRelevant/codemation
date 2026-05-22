/**
 * Behavioral tests for WorkflowActivationPreflight.
 * Tests the assertCanActivate method including error paths.
 */
import type { CredentialTypeDefinition } from "@codemation/core";
import { describe, expect, it } from "vitest";
import type { WorkflowCredentialHealthDto } from "../../src/application/contracts/CredentialContractsRegistry";
import { CredentialOAuth2ScopeResolver } from "../../src/domain/credentials/CredentialOAuth2ScopeResolver";
import { WorkflowActivationPreflight } from "../../src/domain/workflows/WorkflowActivationPreflight";

function makeWorkflowRepository(workflow: object | null = null) {
  return { get: () => workflow };
}

function makeCredentialBindingService(health: object = { workflowId: "wf-1", slots: [] }) {
  return { listWorkflowHealth: async () => health };
}

function makeRules(triggerErrors: string[] = [], credErrors: string[] = []) {
  return {
    collectNonManualTriggerErrors: () => triggerErrors,
    collectRequiredCredentialErrors: () => credErrors,
    collectScopeMismatchErrors: async () => [] as string[],
  };
}

function makeNoopCredentialTypeRegistry() {
  return { listTypes: () => [], getType: () => undefined };
}

function makeNoopCredentialStore() {
  return { getOAuth2Material: async () => undefined };
}

const noopScopeResolver = new CredentialOAuth2ScopeResolver();

describe("WorkflowActivationPreflight.assertCanActivate", () => {
  it("throws 404 when workflow is not found", async () => {
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(null) as never,
      makeCredentialBindingService() as never,
      makeRules() as never,
      makeNoopCredentialTypeRegistry() as never,
      makeNoopCredentialStore() as never,
      noopScopeResolver,
    );
    await expect(preflight.assertCanActivate("wf-missing")).rejects.toMatchObject({ status: 404 });
  });

  it("does not throw when no errors", async () => {
    const workflow = { id: "wf-1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService() as never,
      makeRules([], []) as never,
      makeNoopCredentialTypeRegistry() as never,
      makeNoopCredentialStore() as never,
      noopScopeResolver,
    );
    await expect(preflight.assertCanActivate("wf-1")).resolves.not.toThrow();
  });

  it("throws 400 when there are trigger errors", async () => {
    const workflow = { id: "wf-1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService() as never,
      makeRules(["No valid trigger"], []) as never,
      makeNoopCredentialTypeRegistry() as never,
      makeNoopCredentialStore() as never,
      noopScopeResolver,
    );
    await expect(preflight.assertCanActivate("wf-1")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when there are credential errors", async () => {
    const workflow = { id: "wf-1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService() as never,
      makeRules([], ["Required credential not bound"]) as never,
      makeNoopCredentialTypeRegistry() as never,
      makeNoopCredentialStore() as never,
      noopScopeResolver,
    );
    await expect(preflight.assertCanActivate("wf-1")).rejects.toMatchObject({ status: 400 });
  });

  it("handles URL-encoded workflowId", async () => {
    const workflow = { id: "wf/1", name: "Test", nodes: [], edges: [] };
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService({ workflowId: "wf/1", slots: [] }) as never,
      makeRules() as never,
      makeNoopCredentialTypeRegistry() as never,
      makeNoopCredentialStore() as never,
      noopScopeResolver,
    );
    await expect(preflight.assertCanActivate("wf%2F1")).resolves.not.toThrow();
  });
});

describe("WorkflowActivationPreflight — scope validation integration", () => {
  const WORKFLOW_ID = "wf-scope";
  const workflow = { id: WORKFLOW_ID, name: "Scope Test", nodes: [], edges: [] };

  function makeHealthWithBoundSlot(opts: {
    instanceId?: string;
    typeId?: string;
    displayName?: string;
  } = {}): WorkflowCredentialHealthDto {
    const instanceId = opts.instanceId ?? "inst-1";
    const typeId = opts.typeId ?? "oauth.google.gmail";
    return {
      workflowId: WORKFLOW_ID,
      slots: [
        {
          workflowId: WORKFLOW_ID,
          nodeId: "n1",
          requirement: { slotKey: "gmail", label: "Gmail", acceptedTypes: [typeId] },
          instance: { instanceId, typeId, displayName: opts.displayName ?? "My Gmail", setupStatus: "ready" },
          health: { status: "healthy" },
        },
      ],
    };
  }

  it("allows activation when credential has sufficient scopes", async () => {
    const oauthTypeDef: CredentialTypeDefinition = {
      typeId: "oauth.google.gmail",
      displayName: "Gmail",
      auth: { kind: "oauth2", providerId: "google", scopes: ["https://mail.google.com/"] },
    };
    const health = makeHealthWithBoundSlot();
    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService(health) as never,
      new (class {
        collectNonManualTriggerErrors() { return []; }
        collectRequiredCredentialErrors() { return []; }
        async collectScopeMismatchErrors(_h: WorkflowCredentialHealthDto, _opts: { getRequiredScopes: (t: string) => ReadonlyArray<string>; getGrantedScopes: (id: string) => Promise<ReadonlyArray<string>> }) {
          return [];
        }
      })() as never,
      { listTypes: () => [], getType: () => oauthTypeDef } as never,
      { getOAuth2Material: async () => ({ scopes: ["https://mail.google.com/", "extra"] }) } as never,
      new CredentialOAuth2ScopeResolver(),
    );
    await expect(preflight.assertCanActivate(WORKFLOW_ID)).resolves.toBeUndefined();
  });

  it("blocks activation when credential is missing required scopes", async () => {
    const missingScope = "https://www.googleapis.com/auth/gmail.send";
    const oauthTypeDef: CredentialTypeDefinition = {
      typeId: "oauth.google.gmail",
      displayName: "Gmail",
      auth: { kind: "oauth2", providerId: "google", scopes: ["https://mail.google.com/", missingScope] },
    };
    const health = makeHealthWithBoundSlot({ displayName: "Work Gmail" });

    // Use real WorkflowActivationPreflightRules to test the full integration
    const { WorkflowActivationPreflightRules } = await import("../../src/domain/workflows/WorkflowActivationPreflightRules");
    const rules = new WorkflowActivationPreflightRules();

    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService(health) as never,
      rules,
      { listTypes: () => [], getType: () => oauthTypeDef } as never,
      { getOAuth2Material: async () => ({ scopes: ["https://mail.google.com/"] }) } as never,
      new CredentialOAuth2ScopeResolver(),
    );

    const err = await preflight.assertCanActivate(WORKFLOW_ID).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 400 });
    const payload = (err as { payload?: { errors?: string[] } }).payload;
    const errors = payload?.errors ?? [];
    const combined = errors.join(" ");
    expect(combined).toContain("Work Gmail");
    expect(combined).toContain(missingScope);
    expect(combined).toContain("Reconnect");
  });

  it("allows activation for non-OAuth credential type regardless of granted scopes", async () => {
    const nonOauthDef: CredentialTypeDefinition = {
      typeId: "api.key",
      displayName: "API Key",
    };
    const health = makeHealthWithBoundSlot({ typeId: "api.key" });

    // Use a fake rules that bypasses trigger checks so the scope check is the focus
    const rules = {
      collectNonManualTriggerErrors: () => [],
      collectRequiredCredentialErrors: () => [],
      collectScopeMismatchErrors: async (h: WorkflowCredentialHealthDto, opts: { getRequiredScopes: (typeId: string) => ReadonlyArray<string>; getGrantedScopes: (id: string) => Promise<ReadonlyArray<string>> }) => {
        // Real logic: getRequiredScopes returns [] for non-OAuth, so no error
        const errors: string[] = [];
        for (const slot of h.slots) {
          if (!slot.instance) continue;
          const required = opts.getRequiredScopes(slot.instance.typeId);
          if (required.length === 0) continue;
          const granted = await opts.getGrantedScopes(slot.instance.instanceId);
          const grantedSet = new Set(granted);
          const missing = required.filter((s) => !grantedSet.has(s));
          if (missing.length > 0) errors.push(`Missing: ${missing.join(", ")}`);
        }
        return errors;
      },
    };

    const preflight = new WorkflowActivationPreflight(
      makeWorkflowRepository(workflow) as never,
      makeCredentialBindingService(health) as never,
      rules as never,
      { listTypes: () => [], getType: () => nonOauthDef } as never,
      { getOAuth2Material: async () => undefined } as never,
      new CredentialOAuth2ScopeResolver(),
    );
    await expect(preflight.assertCanActivate(WORKFLOW_ID)).resolves.toBeUndefined();
  });
});
