import { branchRef } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, MapData, If, SubWorkflow } from "@codemation/core-nodes";

export const ORDERS_CREATE_START = "orders.create.start";

type DemoSeedJson = Readonly<{
  subject: string;
  from: string;
}>;

type DemoOutcomeJson = Readonly<{
  note: string;
}>;

export default createWorkflowBuilder({ id: "wf.consumer.demo", name: "Consumer demo (no OpenAI)" })
.trigger(new ManualTrigger("Manual trigger"))
.then(new MapData<unknown, DemoSeedJson>("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com" })))
.then(new If<DemoSeedJson>("If RFQ?", (item) => item.json.subject.toUpperCase().includes("RFQ")))
.when({
  true: [new SubWorkflow<DemoSeedJson, DemoOutcomeJson>("Create order (subworkflow)", "orders.create", [branchRef(0)], ORDERS_CREATE_START)],
  false: [new MapData<DemoSeedJson, DemoOutcomeJson>("Not RFQ", () => ({ note: "Not an RFQ" }))],
})
.build()

