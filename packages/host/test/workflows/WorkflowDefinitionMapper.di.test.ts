import "reflect-metadata";

import { AllWorkflowsActiveWorkflowActivationPolicy, CoreTokens, container } from "@codemation/core";
import { describe, expect, it } from "vitest";

import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";
import { McpServerCatalog } from "../../src/mcp/McpServerCatalog";

describe("WorkflowDefinitionMapper (tsyringe)", () => {
  it("resolves when constructor params use explicit @inject (no emitDecoratorMetadata from bundlers)", () => {
    const child = container.createChildContainer();
    child.registerInstance(CoreTokens.WorkflowActivationPolicy, new AllWorkflowsActiveWorkflowActivationPolicy());
    child.registerSingleton(WorkflowPolicyUiPresentationFactory, WorkflowPolicyUiPresentationFactory);
    child.registerInstance(McpServerCatalog, { get: () => undefined } as unknown as McpServerCatalog);
    child.registerSingleton(WorkflowDefinitionMapper, WorkflowDefinitionMapper);
    const mapper = child.resolve(WorkflowDefinitionMapper);
    expect(mapper).toBeInstanceOf(WorkflowDefinitionMapper);
  });
});
