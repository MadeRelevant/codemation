/**
 * Tests for scenario/hitl-cp-inbox-approval.example.ts
 *
 * Verifies the compiled workflow graph shape:
 * - correct number of nodes
 * - has a gmail trigger node
 * - has an inboxApproval node
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { workflow } from "../src/examples/scenario/hitl-cp-inbox-approval.example";
import { inboxApproval } from "@codemation/core-nodes";
import { OnNewGmailTrigger } from "@codemation/core-nodes-gmail";

// Derive the type token for the inbox approval node by creating a minimal config.
const inboxApprovalType = inboxApproval.create(
  { title: "t", body: "b", priority: "normal", timeout: "24h", onTimeout: "halt" },
  "probe",
).type;

// Derive the type token for OnNewGmailTrigger by constructing a minimal instance.
const gmailTriggerType = new OnNewGmailTrigger("probe", { mailbox: "me" }).type;

describe("hitl-cp-inbox-approval workflow graph", () => {
  it("builds a non-empty workflow definition", () => {
    assert.ok(workflow.nodes.length > 0, "workflow must have at least one node");
    assert.ok(Array.isArray(workflow.edges), "workflow must have an edges array");
  });

  it("has exactly 4 nodes: trigger + map + inboxApproval + httpRequest", () => {
    assert.equal(workflow.nodes.length, 4, `expected 4 nodes, got ${workflow.nodes.length}`);
  });

  it("has a gmail trigger node (OnNewGmailTrigger)", () => {
    const gmailNode = workflow.nodes.find((n) => n.type === gmailTriggerType);
    assert.ok(gmailNode, "workflow must contain an OnNewGmailTrigger node");
    assert.equal(gmailNode.kind, "trigger");
  });

  it("has an inboxApproval node", () => {
    const approvalNode = workflow.nodes.find((n) => n.type === inboxApprovalType);
    assert.ok(approvalNode, "workflow must contain an inboxApproval node");
  });

  it("has exactly one inboxApproval node", () => {
    const approvalNodes = workflow.nodes.filter((n) => n.type === inboxApprovalType);
    assert.equal(approvalNodes.length, 1, "workflow must have exactly one inboxApproval node");
  });
});
