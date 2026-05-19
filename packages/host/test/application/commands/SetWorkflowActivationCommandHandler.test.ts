/**
 * Behavioral tests for SetWorkflowActivationCommandHandler.
 */
import { describe, expect, it } from "vitest";
import { SetWorkflowActivationCommandHandler } from "../../../src/application/commands/SetWorkflowActivationCommandHandler";
import { SetWorkflowActivationCommand } from "../../../src/application/commands/SetWorkflowActivationCommand";
import { RuntimeWorkflowActivationPolicy } from "../../../src/infrastructure/persistence/RuntimeWorkflowActivationPolicy";

function makeHandler(opts: { preflightThrows?: boolean } = {}) {
  const activationRepository = {
    upsert: async () => {},
    load: async () => undefined,
    loadAll: async () => [],
  };
  const policy = new RuntimeWorkflowActivationPolicy();
  const engine = {
    syncWorkflowTriggersForActivation: async () => {},
  };
  const preflight = {
    assertCanActivate: async () => {
      if (opts.preflightThrows) {
        throw Object.assign(new Error("Cannot activate"), { status: 400 });
      }
    },
  };

  return new SetWorkflowActivationCommandHandler(
    activationRepository as never,
    policy,
    engine as never,
    preflight as never,
  );
}

describe("SetWorkflowActivationCommandHandler.execute", () => {
  it("activates workflow and returns { active: true }", async () => {
    const handler = makeHandler();
    const cmd = new SetWorkflowActivationCommand("wf-1", true);
    const result = await handler.execute(cmd);
    expect(result.active).toBe(true);
  });

  it("deactivates workflow and returns { active: false }", async () => {
    const handler = makeHandler();
    const cmd = new SetWorkflowActivationCommand("wf-1", false);
    const result = await handler.execute(cmd);
    expect(result.active).toBe(false);
  });

  it("throws when activation preflight fails", async () => {
    const handler = makeHandler({ preflightThrows: true });
    const cmd = new SetWorkflowActivationCommand("wf-1", true);
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });

  it("skips preflight when deactivating", async () => {
    const handler = makeHandler({ preflightThrows: true });
    // Deactivation bypasses preflight
    const cmd = new SetWorkflowActivationCommand("wf-1", false);
    const result = await handler.execute(cmd);
    expect(result.active).toBe(false);
  });

  it("handles URL-encoded workflowId", async () => {
    const handler = makeHandler();
    const cmd = new SetWorkflowActivationCommand("wf%2F1", true);
    const result = await handler.execute(cmd);
    expect(result.active).toBe(true);
  });
});
