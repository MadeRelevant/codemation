import { branchRef } from "@codemation/core";
import { workflow } from "@codemation/host";
import { MapData, SubWorkflow } from "@codemation/core-nodes";

export const ORDERS_CREATE_START = "orders.create.start";

type DemoSeedJson = Readonly<{
  subject: string;
  from: string;
}>;

type DemoOutcomeJson = Readonly<{
  note: string;
}>;

export default workflow("wf.consumer.demo")
  .name("Consumer demo (no OpenAI)")
  .manualTrigger<DemoSeedJson>("Manual trigger", [
    {
      subject: "RFQ: 1000 widgets",
      from: "buyer@acme.com",
    },
  ])
  .if("If RFQ?", (item, _ctx) => item.json.subject.toUpperCase().includes("RFQ"), {
    true: (b) =>
      b.then(
        new SubWorkflow<DemoSeedJson, DemoOutcomeJson>(
          "Create order (subworkflow)",
          "orders.create",
          [branchRef(0)],
          ORDERS_CREATE_START,
        ),
      ),
    false: (b) =>
      b.then(
        new MapData<DemoSeedJson, DemoOutcomeJson>("Not RFQ", () => ({
          note: "Not an RFQ",
        })),
      ),
  })
  .build();
