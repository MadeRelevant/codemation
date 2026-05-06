import { describe, expect, it } from "vitest";
import { onNewMsGraphMailTrigger } from "../src/mail/onNewMailNode";
import { MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID } from "../src/credentials/msGraphMailOAuth";

describe("onNewMsGraphMailTrigger.create()", () => {
  it("declares trigger kind and stores config", () => {
    const config = onNewMsGraphMailTrigger.create(
      { mailbox: "alice@contoso.com", folderId: "Inbox" } as never,
      "Watch inbox",
      "msgraph_trigger",
    );
    expect(config.kind).toBe("trigger");
    expect(config.name).toBe("Watch inbox");
    expect(config.id).toBe("msgraph_trigger");
    expect(config.cfg).toMatchObject({ mailbox: "alice@contoso.com", folderId: "Inbox" });
  });

  it("requires a single auth credential bound to the msgraph oauth type", () => {
    const config = onNewMsGraphMailTrigger.create({ mailbox: "bob@contoso.com" } as never);
    const creds = config.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
    expect(creds[0]!.acceptedTypes).toContain(MSGRAPH_MAIL_OAUTH_CREDENTIAL_TYPE_ID);
  });

  it("uses the trigger title as default name when name is omitted", () => {
    const config = onNewMsGraphMailTrigger.create({ mailbox: "me" } as never);
    expect(config.name).toBe(onNewMsGraphMailTrigger.title);
  });
});
