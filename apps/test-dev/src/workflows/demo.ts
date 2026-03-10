import { branchRef } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, MapData, If, SubWorkflow } from "@codemation/core-nodes";

export const ORDERS_CREATE_START = "orders.create.start";



export default createWorkflowBuilder({ id: "wf.consumer.demo", name: "Consumer demo (no OpenAI)" })
.trigger(new ManualTrigger("Manual trigger"))
.then(new MapData("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com" })))
.then(new If("If RFQ?", (item) => String((item.json as any)?.subject ?? "").toUpperCase().includes("RFQ")))
.when({
  true: [new SubWorkflow("Create order (subworkflow)", "orders.create", [branchRef(0)], ORDERS_CREATE_START)],
  false: [new MapData("Not RFQ", () => ({ note: "Not an RFQ" }))],
})
.build()

