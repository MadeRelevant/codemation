import { KitchenSinkExample } from "../nodes/kitchenSinkExample";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";

export default createWorkflowBuilder({ id: "wf.consumer.demo", name: "Consumer demo (no OpenAI)" })
.trigger(new ManualTrigger("Manual trigger"))
.then(new MapData("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com", customerName: "Acme Industrial" })))
.then(new KitchenSinkExample("Prepare Odoo quotation draft", {
  customerNameField: "customerName",
}))
.build()

