/**
 * @description Webhook trigger → validate + enrich item in a Callback → forward enriched result.
 * Demonstrates Callback as the primary escape-hatch node for async side-effects and custom logic
 * that doesn't fit MapData (needs awaitable operations, ctx.collections, ctx.binary, etc.).
 * @tags callback, async, side-effect, custom-logic, enrichment, webhook, escape-hatch, style:node
 * @uses @codemation/core-nodes, node:Callback, node:WebhookTrigger
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { createWorkflowBuilder, Callback, WebhookTrigger } from "@codemation/core-nodes";

type LeadPayload = Readonly<{
  email: string;
  companyDomain: string;
}>;

type EnrichedLead = LeadPayload &
  Readonly<{
    companySize: string;
    enrichedAt: string;
  }>;

export default createWorkflowBuilder({
  id: "example.node-callback",
  name: "Callback: async enrich lead record",
})
  .trigger(
    new WebhookTrigger("Incoming lead", {
      endpointKey: "incoming-lead",
      methods: ["POST"],
    }),
  )
  // Use Callback when you need async logic, ctx.collections reads/writes, or ctx.binary access.
  // Unlike MapData, the handler receives the full Items batch and can return a PortsEmission
  // to route items to named ports, or return void to pass items through unchanged.
  .then(
    new Callback<LeadPayload, EnrichedLead>("Enrich lead", async (items, _ctx) => {
      // In a real workflow, call an enrichment API here (e.g. Clearbit, Apollo).
      return items.map((item) => ({
        ...item,
        json: {
          ...item.json,
          companySize: "50-200", // placeholder — replace with live API call
          enrichedAt: new Date().toISOString(),
        },
      }));
    }),
  )
  .build();
