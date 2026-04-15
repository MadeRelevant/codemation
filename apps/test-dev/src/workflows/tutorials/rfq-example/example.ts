import { workflow } from "@codemation/host";
import { AIAgent, Callback, MapData } from "@codemation/core-nodes";
import { ExampleUppercase } from "@codemation/node-example";
import { ClassifyMailToolConfig } from "../../../tools/classifyMailTool";
import { openAiChatModelPresets } from "../../../lib/openAiChatModelPresets";

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

export default workflow("wf.example")
  .name("Example workflow")
  .manualTrigger<ExampleSeedJson>("Manual trigger testertt!", {
    subject: "RFQ: 1000 widgets",
    from: "buyer@acme.com",
    body: "please quote 1000 widgets",
  })
  .then(new ExampleUppercase<ExampleSeedJson, "subject">("Uppercase subject", { field: "subject" }))
  .then(
    new AIAgent<ExampleSeedJson, ExampleAgentJson>({
      name: "Classify (agent)",
      messages: [
        {
          role: "system",
          content:
            "Classify if the message is an RFQ. Use the available tools when needed and return strict JSON with keys isRfq and summary only.",
        },
        { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
      ],
      chatModel: openAiChatModelPresets.demoGpt41,
      tools: [
        new ClassifyMailToolConfig("classifyMail", ["RFQ", "QUOTE", "QUOTATION"], undefined, {
          icon: "mail",
          label: "Classify mail!",
        }),
      ],
    }),
  )
  .if("If RFQ?", (item, _ctx) => (item.json as ExampleAgentJson).isRfq, {
    true: (b) =>
      b.then(
        new Callback<ExampleAgentJson, ExampleOutcomeJson>("Create order (callback)", (items) =>
          items.map((item) => ({
            ...item,
            json: {
              ...item.json,
              orderStatus: "created",
            },
          })),
        ),
      ),
    false: (b) =>
      b.then(
        new MapData<ExampleAgentJson, ExampleOutcomeJson>("Not RFQ", (item) => ({
          ...item.json,
          orderStatus: "ignored",
          note: item.json.summary,
        })),
      ),
  })
  .build();
