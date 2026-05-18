/**
 * @description Manual trigger → SubWorkflow invokes a reusable enrichment workflow per item.
 * Demonstrates SubWorkflow as the composition primitive: invoke another workflow by id for each input item.
 * @tags subworkflow, composition, reuse, invoke, call, modular, nested, style:node
 * @uses @codemation/core-nodes, node:SubWorkflow
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { SubWorkflow, MapData } from "@codemation/core-nodes";

type ContactInput = Readonly<{
  email: string;
  companyDomain: string;
}>;

type EnrichedContact = Readonly<{
  email: string;
  companyDomain: string;
  [key: string]: unknown;
}>;

export default workflow("example.node-subworkflow")
  .name("SubWorkflow: invoke reusable enrichment workflow per contact")
  .manualTrigger<ContactInput>("Contacts to enrich", [
    { email: "alice@acme.com", companyDomain: "acme.com" },
    { email: "bob@widgets.io", companyDomain: "widgets.io" },
  ])
  // SubWorkflow invokes another workflow synchronously for each input item.
  // Use it to reuse a workflow as a shared sub-routine without duplicating node graphs.
  // The referenced workflow id must exist in the same workspace; its trigger is bypassed.
  // NOTE: "example.enrich-contact" is illustrative — substitute a real workflow id.
  .then(
    new SubWorkflow<ContactInput, EnrichedContact>(
      "Enrich contact",
      "example.enrich-contact", // id of the target workflow to invoke
    ),
  )
  .then(
    new MapData<EnrichedContact, { email: string; summary: string }>("Summarize result", (item) => ({
      email: item.json.email,
      summary: `Enriched: ${item.json.companyDomain}`,
    })),
  )
  .build();
