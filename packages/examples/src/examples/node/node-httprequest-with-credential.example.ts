/**
 * @description Manual trigger → HttpRequest GET a protected JSON API with a bearer-token credential.
 * Demonstrates the object form of credentialSlot to narrow accepted credential types to bearer only.
 * @tags http, rest, api, fetch, request, get, credential, bearer, authentication, auth, style:node
 * @uses @codemation/core-nodes, node:HttpRequest, credential:bearer
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { HttpRequest, bearerTokenCredentialType } from "@codemation/core-nodes";

export default workflow("example.node-httprequest-with-credential")
  .name("HttpRequest: GET with bearer credential")
  .manualTrigger<unknown>("Fetch protected resource", [{}])
  // Use the object form of credentialSlot to narrow which credential types the UI
  // will offer for this slot.  Only bearer-token credentials will appear in the
  // credential picker — API-key, basic-auth, and OAuth2 are excluded.
  .then(
    new HttpRequest("GET protected endpoint", {
      method: "GET",
      url: "https://httpbin.org/bearer",
      headers: { "User-Agent": "codemation-example" },
      // Object form: name the slot and supply a narrowed acceptedTypes list.
      // Swap bearerTokenCredentialType for apiKeyCredentialType / oauth2ClientCredentialsType
      // when the target API uses a different auth scheme.
      credentialSlot: { name: "auth", acceptedTypes: [bearerTokenCredentialType] },
    }),
  )
  .build();
