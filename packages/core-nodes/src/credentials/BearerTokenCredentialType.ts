import { defineCredential } from "@codemation/core";
import type { CredentialSession, HttpCredentialDelta } from "../http/httpRequest.types";

/**
 * Simple Bearer token credential.
 * Session sets `Authorization: Bearer <token>` on every request.
 */
export const bearerTokenCredentialType = defineCredential({
  key: "core-nodes.bearer-token",
  label: "Bearer Token",
  description: "Authenticates requests using a static Bearer token in the Authorization header.",
  public: {},
  secret: {
    token: {
      label: "Token",
      type: "password",
      required: true,
      helpText: "The Bearer token to include in the Authorization header.",
    },
  },
  async createSession(args): Promise<CredentialSession> {
    const token = String(args.material.token ?? "");
    if (!token) {
      throw new Error("Bearer token credential material is incomplete: token is required.");
    }
    return {
      applyToRequest: (_spec): HttpCredentialDelta => ({
        headers: { authorization: `Bearer ${token}` },
      }),
    };
  },
  async test(args) {
    const token = String(args.material.token ?? "");
    return {
      status: token.length > 0 ? "healthy" : "failing",
      message: token.length > 0 ? "Bearer token is configured." : "Token is missing.",
      testedAt: new Date().toISOString(),
    };
  },
});
