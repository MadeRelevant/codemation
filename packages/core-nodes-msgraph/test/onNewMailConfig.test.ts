import { describe, expect, it } from "vitest";
import { OnNewMsGraphMailTrigger } from "../src/mail/onNewMailConfig";
import { MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID } from "../src/credentials/msGraphOAuth";

describe("OnNewMsGraphMailTrigger", () => {
  it("declares trigger kind, icon, and stores config + id", () => {
    const trigger = new OnNewMsGraphMailTrigger(
      "Watch inbox",
      { mailbox: "alice@contoso.com", folderId: "Inbox" },
      "msgraph_trigger",
    );
    expect(trigger.kind).toBe("trigger");
    expect(trigger.icon).toBe("si:microsoft");
    expect(trigger.name).toBe("Watch inbox");
    expect(trigger.cfg.mailbox).toBe("alice@contoso.com");
    expect(trigger.id).toBe("msgraph_trigger");
  });

  it("requires a single auth credential bound to the msgraph oauth type", () => {
    const trigger = new OnNewMsGraphMailTrigger("t", { mailbox: "bob@contoso.com" });
    const requirements = trigger.getCredentialRequirements();
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({
      slotKey: "auth",
      acceptedTypes: [MSGRAPH_OAUTH_CREDENTIAL_TYPE_ID],
    });
  });
});
