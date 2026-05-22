import { describe, expect, it } from "vitest";
import { oauthGoogleGmailType } from "../src/credentials/oauthGoogleGmailType";

describe("oauthGoogleGmailType", () => {
  const { definition } = oauthGoogleGmailType;

  it("has typeId oauth.google.gmail", () => {
    expect(definition.typeId).toBe("oauth.google.gmail");
  });

  it("has auth.kind oauth2 with the correct URLs", () => {
    const auth = definition.auth;
    expect(auth?.kind).toBe("oauth2");
    if (!auth || auth.kind !== "oauth2") {
      throw new Error("auth is not oauth2");
    }
    // The third union variant: providerId + authorizeUrl + tokenUrl
    expect("authorizeUrl" in auth && auth.authorizeUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect("tokenUrl" in auth && auth.tokenUrl).toBe("https://oauth2.googleapis.com/token");
  });

  it("defaultScopes includes gmail.readonly and gmail.send", () => {
    const auth = definition.auth;
    expect(auth?.kind).toBe("oauth2");
    if (!auth || auth.kind !== "oauth2") {
      throw new Error("auth is not oauth2");
    }
    const scopes = auth.scopes;
    expect(scopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(scopes).toContain("https://www.googleapis.com/auth/gmail.send");
  });

  it("publicFields has clientId with required: true", () => {
    const clientIdField = definition.publicFields?.find((f) => f.key === "clientId");
    expect(clientIdField).toBeDefined();
    expect(clientIdField?.required).toBe(true);
  });

  it("secretFields has clientSecret with required: true", () => {
    const clientSecretField = definition.secretFields?.find((f) => f.key === "clientSecret");
    expect(clientSecretField).toBeDefined();
    expect(clientSecretField?.required).toBe(true);
  });
});
