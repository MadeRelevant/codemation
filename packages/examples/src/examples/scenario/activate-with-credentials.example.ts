/**
 * @description Workflow requiring two credentials to activate: Gmail OAuth and a Bearer Token for
 * an external API. Demonstrates the activation error path — if either credential is not connected,
 * the workflow stays in "needs credentials" state and the user is prompted to connect them.
 * Substitution: no native Slack node exists; the second service is a generic HTTP endpoint
 * authenticated with a Bearer Token credential.
 * @tags credentials, activation, multi-service, gmail, http, bearer, oauth, setup, connect, style:scenario
 * @uses @codemation/core-nodes-gmail, credential:gmail, credential:bearer-token
 * @dependencies @codemation/core-nodes@workspace:*, @codemation/core-nodes-gmail@workspace:*
 */

import { workflow } from "@codemation/host";
import { HttpRequest, MapData } from "@codemation/core-nodes";
import { SendGmailMessage } from "@codemation/core-nodes-gmail";
type NotificationPayload = Readonly<{
  subject: string;
  from: string;
  messageId: string;
}>;

// This workflow requires TWO credentials to be connected before it can activate:
//   1. Gmail OAuth → bound to the OnNewGmailTrigger (slot: "auth") and SendGmailMessage (slot: "auth").
//   2. Bearer Token → bound to the HttpRequest notify step (slot: "notify-bearer").
// If either credential is missing, the host will report an activation error listing the unresolved slots.

export default workflow("example.activate-with-credentials")
  .name("Activate with credentials: Gmail + HTTP bearer")
  .manualTrigger<NotificationPayload>("Simulate incoming email notification", [
    {
      messageId: "msg-001",
      subject: "New order received",
      from: "customer@example.com",
    },
  ])
  // Step 1: Notify an external webhook using a Bearer Token credential.
  // The "notify-bearer" slot must be bound to a Bearer Token credential instance before activation.
  .then(
    new HttpRequest("Notify external webhook", {
      method: "POST",
      url: "https://hooks.example.com/incoming",
      credentialSlot: "notify-bearer",
      body: {
        kind: "json",
        data: JSON.stringify({ event: "email.received" }),
      },
    }),
  )
  // Step 2: Map back to a Gmail-sendable shape.
  .then(
    new MapData<unknown, { to: string; subject: string; text: string }>("Prepare acknowledgement email", (_item) => ({
      to: "admin@yourcompany.com",
      subject: "Email notification forwarded",
      text: "The incoming email notification was successfully forwarded to the external webhook.",
    })),
  )
  // Step 3: Send a confirmation via Gmail.
  // The "auth" slot must be bound to a Gmail OAuth credential instance before activation.
  .then(new SendGmailMessage("Send confirmation email", "send_confirmation"))
  .build();
