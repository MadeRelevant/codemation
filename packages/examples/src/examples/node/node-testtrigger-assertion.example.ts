/**
 * @description TestTrigger provides hardcoded fixtures → MapData transforms → Assertion validates output.
 * Demonstrates the workflow testing primitive: TestTrigger replaces live triggers for test runs,
 * Assertion records per-item pass/fail results visible in the canvas Tests tab.
 * @tags testing, assertion, fixtures, test, validate, pass, fail, unit-test, style:node
 * @uses @codemation/core-nodes, node:TestTrigger, node:Assertion
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { createWorkflowBuilder, TestTrigger, MapData, Assertion } from "@codemation/core-nodes";

interface PriceInput {
  readonly amountCents: number;
  readonly expectedUsd: number;
}

interface PriceOutput {
  readonly amountCents: number;
  readonly amountUsd: number;
  readonly expectedUsd: number;
}

export default createWorkflowBuilder({
  id: "example.node-testtrigger-assertion",
  name: "TestTrigger + Assertion: validate cents-to-USD conversion",
})
  // TestTrigger replaces live triggers during test runs.
  // generateItems is an async generator: yield one Item per test case.
  // The Tests tab dispatches a separate workflow run per yielded item (with executionOptions.testContext set).
  .trigger(
    new TestTrigger<PriceInput>({
      name: "Price conversion fixtures",
      description: "Three fixed price inputs with expected USD values.",
      async *generateItems() {
        yield { json: { amountCents: 100, expectedUsd: 1.0 } };
        yield { json: { amountCents: 999, expectedUsd: 9.99 } };
        yield { json: { amountCents: 4750, expectedUsd: 47.5 } };
      },
      caseLabel: (item) => `${item.json.amountCents} cents`,
    }),
  )
  // The node under test: convert cents → USD.
  .then(
    new MapData<PriceInput, PriceOutput>("Convert cents to USD", (item) => ({
      amountCents: item.json.amountCents,
      amountUsd: item.json.amountCents / 100,
      expectedUsd: item.json.expectedUsd,
    })),
  )
  // Assertion records pass/fail results per item. score: 1 = pass, 0 = fail.
  // Each AssertionResult becomes a TestAssertion row; the Tests tab aggregates them into a pass-rate chart.
  .then(
    new Assertion<PriceOutput>({
      name: "Validate USD conversion",
      assertions: (item) => [
        {
          name: "amountUsd matches expectedUsd",
          score: item.json.amountUsd === item.json.expectedUsd ? 1 : 0,
          expected: item.json.expectedUsd,
          actual: item.json.amountUsd,
        },
      ],
    }),
  )
  .build();
