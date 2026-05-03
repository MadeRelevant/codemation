/**
 * End-to-end smoke for the Workflow Testing primitive.
 *
 * Three hardcoded fixtures flow through:  TestTrigger → DoubleValue → AssertDoubled.
 * Each case produces 2 assertions (doubled matches expected; doubled is even), so a successful
 * suite run yields 3 child runs and 6 TestAssertion rows. Drives the host orchestrator through
 * the Tests tab in the UI or via `POST /api/workflows/:id/test-suite-runs`.
 */
import { Assertion, createWorkflowBuilder, MapData, TestTrigger } from "@codemation/core-nodes";

interface TestCaseInput {
  readonly value: number;
  readonly expected: number;
}

interface DoubledItem {
  readonly value: number;
  readonly expected: number;
  readonly doubled: number;
}

export default createWorkflowBuilder({
  id: "wf.test-dev.test-suite-demo",
  name: "Test suite demo (TestTrigger + Assertion)",
})
  .trigger(
    new TestTrigger<TestCaseInput>({
      name: "Fixture test cases",
      id: "test_trigger",
      async *generateItems() {
        yield { json: { value: 2, expected: 4 } };
        yield { json: { value: 3, expected: 6 } };
        yield { json: { value: 5, expected: 10 } };
      },
    }),
  )
  .then(
    new MapData<TestCaseInput, DoubledItem>(
      "Double the value",
      (item) => ({
        value: item.json.value,
        expected: item.json.expected,
        doubled: item.json.value * 2,
      }),
      { id: "double_value" },
    ),
  )
  .then(
    new Assertion<DoubledItem>({
      name: "Assert doubled equals expected",
      id: "assertions",
      assertions: (item) => [
        {
          name: "doubled matches expected",
          status: item.json.doubled === item.json.expected ? "pass" : "fail",
          expected: item.json.expected,
          actual: item.json.doubled,
        },
        {
          name: "doubled is even",
          status: item.json.doubled % 2 === 0 ? "pass" : "fail",
          actual: item.json.doubled,
        },
      ],
    }),
  )
  .build();
