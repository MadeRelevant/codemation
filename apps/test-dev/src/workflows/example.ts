import { ClassifyMailToolConfig } from "../tools/classifyMailTool";
import { AIAgent, Callback, createWorkflowBuilder, If, ManualTrigger, MapData, OpenAIChatModelConfig } from "@codemation/core-nodes";
import { ExampleUppercase } from "@codemation/node-example";

export const ORDERS_CREATE_START = "orders.create.start";

type ExampleSeedJson = Readonly<{
  subject: string;
  from: string;
  body: string;
}>;

type ExampleAgentJson = Readonly<{
  isRfq: boolean;
  summary: string;
}>;

type ExampleOutcomeJson = ExampleAgentJson &
  Readonly<{
    orderStatus: "created" | "ignored";
    note?: string;
  }>;

export default createWorkflowBuilder({ id: "wf.example", name: "Example workflow" })
.trigger(
  new ManualTrigger<ExampleSeedJson>("Manual trigger", [
    {
      subject: "RFQ: 1000 widgets",
      from: "buyer@acme.com",
      body: "please quote 1000 widgets",
    },
  ]),
)
.then(new ExampleUppercase<ExampleSeedJson, "subject">("Uppercase subject", { field: "subject" }))
.then(
  new AIAgent<ExampleSeedJson, ExampleAgentJson>(
    "Classify (agent)",
    "Classify if the message is an RFQ. Use the available tools when needed and return strict JSON with keys isRfq and summary only.",
    (item) => JSON.stringify(item.json ?? {}),
    new OpenAIChatModelConfig("OpenAI", "gpt-4.1", "openai", { icon: "bot", label: "OpenAI" }),
    [new ClassifyMailToolConfig("classifyMail", ["RFQ", "QUOTE", "QUOTATION"], undefined, { icon: "mail", label: "Classify mail!" })],
  ),
)
.then(new If<ExampleAgentJson>("If RFQ?", (item) => item.json.isRfq))
.when({
  true: [
    new Callback<ExampleAgentJson, ExampleOutcomeJson>("Create order (callback)", (items) =>
      items.map((item) => ({
        ...item,
        json: {
          ...item.json,
          orderStatus: "created",
        },
      })),
    ),
  ],
  false: [
    new MapData<ExampleAgentJson, ExampleOutcomeJson>("Not RFQ", (item) => ({
      ...item.json,
      orderStatus: "ignored",
      note: item.json.summary,
    })),
  ],
})
.build()