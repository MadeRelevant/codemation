import { defineCredential } from "@codemation/core";
import type { CredentialSession, HttpCredentialDelta } from "../http/httpRequest.types";

/**
 * HTTP Basic authentication credential.
 * Session sets `Authorization: Basic <base64(username:password)>`.
 */
export const basicAuthCredentialType = defineCredential({
  key: "core-nodes.basic-auth",
  label: "Basic Auth",
  description: "Authenticates requests using HTTP Basic Authentication (username + password).",
  public: {
    username: {
      label: "Username",
      type: "string",
      required: true,
      helpText: "The username for HTTP Basic Authentication.",
    },
  },
  secret: {
    password: {
      label: "Password",
      type: "password",
      required: true,
      helpText: "The password for HTTP Basic Authentication.",
    },
  },
  async createSession(args): Promise<CredentialSession> {
    const username = String(args.publicConfig.username ?? "");
    const password = String(args.material.password ?? "");
    if (!username) {
      throw new Error("Basic Auth credential is incomplete: username is required.");
    }
    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    return {
      applyToRequest: (_spec): HttpCredentialDelta => ({
        headers: { authorization: `Basic ${encoded}` },
      }),
    };
  },
  async test(args) {
    const username = String(args.publicConfig.username ?? "");
    const password = String(args.material.password ?? "");
    const ok = username.length > 0 && password.length > 0;
    return {
      status: ok ? "healthy" : "failing",
      message: ok ? "Basic Auth credentials are configured." : "Username or password is missing.",
      testedAt: new Date().toISOString(),
    };
  },
});
