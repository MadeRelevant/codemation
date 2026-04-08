/** See `webhook.normal.ts` — webhook triggers use `createWorkflowBuilder`. */
import {
  createWorkflowBuilder,
  MapData,
  WebhookRespondNowAndContinueError,
  WebhookTrigger,
} from "@codemation/core-nodes";

export default createWorkflowBuilder({ id: "wf.webhook.respond-continue", name: "Webhook respond now and continue" })
  .trigger(
    new WebhookTrigger(
      "Respond and continue webhook",
      {
        endpointKey: "respond-continue",
        methods: ["POST"],
      },
      (items) => {
        throw new WebhookRespondNowAndContinueError(
          [
            {
              json: {
                ok: true,
                mode: "continue",
                accepted: true,
              },
            },
          ],
          items,
        );
      },
      "webhook_trigger",
    ),
  )
  .then(
    new MapData(
      "Continue processing request",
      (item) => {
        return {
          ok: true,
          continued: true,
          request: item.json,
        };
      },
      "continued_processing",
    ),
  )
  .build();
