/**
 * Unit tests for inspectorSummary() on built-in gmail node config classes.
 * No engine / DI setup required — just construct the config and call the method.
 */
import { describe, expect, it } from "vitest";

import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import { SendGmailMessage } from "../src/nodes/SendGmailMessage";
import { ReplyToGmailMessage } from "../src/nodes/ReplyToGmailMessage";
import { ModifyGmailLabels } from "../src/nodes/ModifyGmailLabels";

// ---------------------------------------------------------------------------
// OnNewGmailTrigger
// ---------------------------------------------------------------------------

describe("OnNewGmailTrigger inspectorSummary", () => {
  it("returns mailbox row", () => {
    const trigger = new OnNewGmailTrigger("trigger", { mailbox: "alice@gmail.com" });
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Mailbox", value: "alice@gmail.com" });
  });

  it("includes label IDs when set", () => {
    const trigger = new OnNewGmailTrigger("trigger", {
      mailbox: "me@gmail.com",
      labelIds: ["INBOX", "UNREAD"],
    });
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Labels", value: "INBOX, UNREAD" });
  });

  it("includes query row when set", () => {
    const trigger = new OnNewGmailTrigger("trigger", {
      mailbox: "me@gmail.com",
      query: "from:boss@company.com is:unread",
    });
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Query", value: "from:boss@company.com is:unread" });
  });

  it("truncates long query to 80 chars with ellipsis", () => {
    const longQuery = "subject:" + "x".repeat(80);
    const trigger = new OnNewGmailTrigger("trigger", { mailbox: "me@gmail.com", query: longQuery });
    const rows = trigger.inspectorSummary();
    const queryRow = rows.find((r) => r.label === "Query");
    expect(queryRow?.value.length).toBeLessThanOrEqual(80);
    expect(queryRow?.value).toMatch(/…$/);
  });

  it("includes download-attachments row when true", () => {
    const trigger = new OnNewGmailTrigger("trigger", {
      mailbox: "me@gmail.com",
      downloadAttachments: true,
    });
    const rows = trigger.inspectorSummary();
    expect(rows).toContainEqual({ label: "Download attachments", value: "yes" });
  });

  it("does not include download-attachments row when false", () => {
    const trigger = new OnNewGmailTrigger("trigger", {
      mailbox: "me@gmail.com",
      downloadAttachments: false,
    });
    const rows = trigger.inspectorSummary();
    expect(rows.map((r) => r.label)).not.toContain("Download attachments");
  });
});

// ---------------------------------------------------------------------------
// Gmail action nodes — all config is per-item (inputSchema only).
// These classes have only name + id; there is no inspectorSummary method.
// ---------------------------------------------------------------------------

describe("SendGmailMessage inspectorSummary", () => {
  it("does not have an inspectorSummary method (all config is per-item)", () => {
    const node = new SendGmailMessage("send");
    // The NodeConfigBase contract only declares inspectorSummary as optional.
    // These action nodes intentionally omit it — the inspector hides the section.
    expect("inspectorSummary" in node).toBe(false);
  });
});

describe("ReplyToGmailMessage inspectorSummary", () => {
  it("does not have an inspectorSummary method (all config is per-item)", () => {
    const node = new ReplyToGmailMessage("reply");
    expect("inspectorSummary" in node).toBe(false);
  });
});

describe("ModifyGmailLabels inspectorSummary", () => {
  it("does not have an inspectorSummary method (all config is per-item)", () => {
    const node = new ModifyGmailLabels("labels");
    expect("inspectorSummary" in node).toBe(false);
  });
});
