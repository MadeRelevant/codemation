/**
 * @description Wrap a secured REST endpoint as a reusable workflow node using defineRestNode with
 * a bearer-token credential slot. Shows the credentialSlot pattern: the framework resolves the
 * credential session and injects the Authorization header automatically.
 * Bind a Bearer Token credential to the "auth" slot before activating the workflow.
 * @tags defineRestNode custom-api credential bearer auth oauth secured style:node
 * @uses defineRestNode, bearerTokenCredentialType, credential:bearer-token, node:getSecuredPost
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { defineRestNode, bearerTokenCredentialType } from "@codemation/core-nodes";
import { z } from "zod";

// ----- Step 1: Define the custom node with a credential slot -----
//
// Add a `credentials` map to defineRestNode to declare which credential slots this node needs.
// The framework resolves each slot to a session and injects it into the HTTP request automatically
// (Bearer adds Authorization: Bearer <token>; API Key adds a query param or header).
export const getSecuredPost = defineRestNode({
  key: "example.jsonplaceholder.get-secured-post",
  title: "Get Secured Post",
  description: "Fetches a post from a bearer-token–secured API. Demonstrates the credential slot pattern.",
  icon: "lucide:lock",
  api: {
    baseUrl: "https://jsonplaceholder.typicode.com",
    path: "/posts/{postId}",
    method: "GET",
  },
  // Declare credential slots. The slot key ("auth") is matched when the user binds a credential
  // in the workflow canvas. Mark `optional: true` for credentials that aren't strictly required.
  credentials: {
    auth: {
      type: bearerTokenCredentialType,
      label: "API bearer token",
      helpText: "Bind a Bearer Token credential. The framework injects Authorization: Bearer <token>.",
    },
  },
  inputSchema: z.object({
    postId: z.string().describe("ID of the post to fetch"),
  }),
  response: ({ json }) => {
    const post = json as { id: number; title: string; body: string; userId: number };
    return {
      postId: post.id,
      title: post.title,
      body: post.body,
      authorId: post.userId,
    };
  },
});

// ----- Step 2: Use the custom node in a workflow -----

// The workflow won't activate until a Bearer Token credential is bound to the "auth" slot.
// In the canvas: open the node inspector → Credentials tab → connect a Bearer Token.
export default workflow("example.custom-rest-node-with-credential")
  .name("Custom REST node: secured endpoint with bearer credential")
  .manualTrigger<{ postId: string }>("Fetch secured posts", [{ postId: "1" }, { postId: "5" }])
  // getSecuredPost.create({}, label, id) — static config is empty for defineRestNode.
  // The "auth" credential is resolved from the bound credential slot, not from item.json.
  .then(getSecuredPost.create({}, "Fetch secured post", "fetch-secured-post"))
  .build();
