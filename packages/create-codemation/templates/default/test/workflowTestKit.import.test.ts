import { test, expect } from "vitest";
import "reflect-metadata";

import { WorkflowTestKit } from "@codemation/core/testing";

test("WorkflowTestKit is available from @codemation/core/testing", () => {
  expect(new WorkflowTestKit()).toBeDefined();
});
