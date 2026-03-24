import "reflect-metadata";

import { container } from "@codemation/core";
import { describe, expect, it } from "vitest";

import { WorkflowDefinitionMapper } from "../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../src/application/mapping/WorkflowPolicyUiPresentationFactory";

describe("WorkflowDefinitionMapper (tsyringe)", () => {
  it("resolves when constructor params use explicit @inject (no emitDecoratorMetadata from bundlers)", () => {
    const child = container.createChildContainer();
    child.register(WorkflowPolicyUiPresentationFactory, { useClass: WorkflowPolicyUiPresentationFactory });
    child.register(WorkflowDefinitionMapper, { useClass: WorkflowDefinitionMapper });
    const mapper = child.resolve(WorkflowDefinitionMapper);
    expect(mapper).toBeInstanceOf(WorkflowDefinitionMapper);
  });
});
