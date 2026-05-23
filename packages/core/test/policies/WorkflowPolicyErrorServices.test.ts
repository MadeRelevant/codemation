import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { WorkflowPolicyErrorServices } from "../../src/policies/WorkflowPolicyErrorServices";
import type { NodeErrorHandler, NodeResolver, WorkflowErrorHandler } from "../../src/types";

class StubNodeResolver implements NodeResolver {
  resolve<T>(token: unknown): T {
    return token as T;
  }
}

describe("WorkflowPolicyErrorServices", () => {
  test("resolveNodeErrorHandler returns undefined when spec is undefined", () => {
    const services = new WorkflowPolicyErrorServices(new StubNodeResolver());
    assert.equal(services.resolveNodeErrorHandler(undefined), undefined);
  });

  test("resolveNodeErrorHandler returns inline handler when spec already has .handle", () => {
    const services = new WorkflowPolicyErrorServices(new StubNodeResolver());
    const inlineHandler: NodeErrorHandler = {
      handle: async () => ({ main: [] }),
    };
    const result = services.resolveNodeErrorHandler(inlineHandler);
    assert.strictEqual(result, inlineHandler);
  });

  test("resolveNodeErrorHandler delegates to nodeResolver when spec is a token", () => {
    const tokenHandler: NodeErrorHandler = { handle: async () => ({ main: [] }) };
    const resolver: NodeResolver = { resolve: () => tokenHandler as never };
    const services = new WorkflowPolicyErrorServices(resolver);
    const result = services.resolveNodeErrorHandler(class FakeHandler {} as never);
    assert.strictEqual(result, tokenHandler);
  });

  test("resolveWorkflowErrorHandler returns undefined when spec is undefined", () => {
    const services = new WorkflowPolicyErrorServices(new StubNodeResolver());
    assert.equal(services.resolveWorkflowErrorHandler(undefined), undefined);
  });

  test("resolveWorkflowErrorHandler returns inline handler when spec already has .onError", () => {
    const services = new WorkflowPolicyErrorServices(new StubNodeResolver());
    const inlineHandler: WorkflowErrorHandler = {
      onError: async () => undefined,
    };
    const result = services.resolveWorkflowErrorHandler(inlineHandler);
    assert.strictEqual(result, inlineHandler);
  });

  test("resolveWorkflowErrorHandler delegates to nodeResolver when spec is a token", () => {
    const wfHandler: WorkflowErrorHandler = { onError: async () => undefined };
    const resolver: NodeResolver = { resolve: () => wfHandler as never };
    const services = new WorkflowPolicyErrorServices(resolver);
    const result = services.resolveWorkflowErrorHandler(class FakeWfHandler {} as never);
    assert.strictEqual(result, wfHandler);
  });
});
