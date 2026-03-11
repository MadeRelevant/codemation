import { createWorkflowBuilder, MapData, WebhookRespondNowError, WebhookTrigger } from "@codemation/core-nodes";

export default createWorkflowBuilder({ id: "wf.webhook.respond-now", name: "Webhook respond now and stop" })
  .trigger(
    new WebhookTrigger(
      "Respond now webhook",
      {
        endpointKey: "respond-now",
        methods: ["POST"],
      },
      (items) => {
        throw new WebhookRespondNowError([
          {
            json: {
              ok: true,
              mode: "stop",
              received: items[0]?.json ?? null,
            },
          },
        ]);
      },
      "webhook_trigger",
    ),
  )
  .then(
    new MapData("This step should never run", () => {
      return {
        ok: false,
      };
    }, "never_reached"),
  )
  .build();
