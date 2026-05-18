import { createHmac, createHash, randomBytes } from "node:crypto";
import type { ChatLanguageModel, ChatModelFactory, NodeExecutionContext } from "@codemation/core";
import { chatModel } from "@codemation/core";

import { createOpenAI } from "@ai-sdk/openai";

import type { CodemationChatModelConfig } from "./CodemationChatModelConfig";

@chatModel({ packageName: "@codemation/core-nodes" })
export class CodemationChatModelFactory implements ChatModelFactory<CodemationChatModelConfig> {
  create(
    args: Readonly<{ config: CodemationChatModelConfig; ctx: NodeExecutionContext<any> }>,
  ): Promise<ChatLanguageModel> {
    // D5: read at session-create time so unpairing or misconfiguration surfaces at workflow run, not boot.
    // eslint-disable-next-line no-restricted-properties -- LLM_GATEWAY_URL is injected by the control-plane provisioner into the workspace process env; reading it at factory-create time is the justified boundary.
    const gatewayUrl = process.env["LLM_GATEWAY_URL"];
    if (!gatewayUrl) {
      throw new Error("Codemation managed AI not available in this environment (LLM_GATEWAY_URL is not set).");
    }

    // eslint-disable-next-line no-restricted-properties -- workspace pairing vars are injected by the provisioner; factory reading them here is the justified boundary.
    const workspaceId = process.env["WORKSPACE_ID"];
    // eslint-disable-next-line no-restricted-properties -- workspace pairing vars are injected by the provisioner; factory reading them here is the justified boundary.
    const pairingSecret = process.env["WORKSPACE_PAIRING_SECRET"];
    if (!workspaceId || !pairingSecret) {
      throw new Error("Codemation managed AI not available in this environment (workspace pairing is not configured).");
    }

    const hmacFetch = this.buildHmacSignedFetch(workspaceId, pairingSecret);
    // apiKey is required by the AI SDK but unused — authentication is handled by the HMAC-signed fetch wrapper.
    const provider = createOpenAI({ baseURL: `${gatewayUrl}/v1`, apiKey: "codemation-managed", fetch: hmacFetch });
    const languageModel = provider.chat(args.config.model);

    return Promise.resolve({
      languageModel,
      modelName: args.config.model,
      provider: "codemation-managed",
      defaultCallOptions: {
        maxOutputTokens: args.config.options?.maxTokens,
        temperature: args.config.options?.temperature,
      },
    });
  }

  /**
   * Creates an HMAC-signed fetch wrapper for use with AI SDK's createOpenAI.
   * Each call signs the request body with the workspace pairing secret so the
   * LLM broker can authenticate the workspace without a user-managed API key.
   *
   * Mirrors HmacRequestSigner from @codemation/host/pairing without importing
   * that package (which would create a circular dependency since @codemation/host
   * depends on @codemation/core-nodes).
   */
  private buildHmacSignedFetch(workspaceId: string, pairingSecret: string): typeof fetch {
    return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "POST";

      // Normalise body to a string for signing. Chat completions are always JSON strings
      // but the fetch spec allows other BodyInit types — handle those defensively.
      let bodyString = "";
      if (init?.body !== undefined && init.body !== null) {
        if (typeof init.body === "string") {
          bodyString = init.body;
        } else {
          bodyString = await new Response(init.body).text();
        }
      }

      const authHeader = this.buildHmacAuthHeader(workspaceId, pairingSecret, method, url, bodyString);

      const headers = new Headers(init?.headers as Record<string, string> | undefined);
      headers.set("Authorization", authHeader);

      // Use the same (possibly normalised) body string that was signed.
      const effectiveBody = bodyString || init?.body;
      return fetch(input, { ...init, body: effectiveBody, headers });
    };
  }

  /**
   * Produces a Codemation-Hmac v1 Authorization header value.
   * The algorithm must match HmacVerifier.computeSignature() in the control-plane.
   */
  private buildHmacAuthHeader(
    workspaceId: string,
    pairingSecret: string,
    method: string,
    url: string,
    body: string,
  ): string {
    const ts = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(16).toString("base64");
    const parsed = new URL(url);
    const path = (parsed.pathname + parsed.search).toLowerCase();
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const baseString = [method.toUpperCase(), path, ts, nonce, bodyHash].join("\n");
    // eslint-disable-next-line codemation/no-buffer-everything -- pairing secret is a fixed 32-byte value, never large
    const secretBytes = Buffer.from(pairingSecret, "base64");
    const sig = createHmac("sha256", secretBytes).update(baseString, "utf8").digest("base64");
    return `Codemation-Hmac v=1,workspaceId=${workspaceId},ts=${ts},nonce=${nonce},sig=${sig}`;
  }
}
