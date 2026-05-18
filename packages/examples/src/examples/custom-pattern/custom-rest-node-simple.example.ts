/**
 * @description Wrap a public REST endpoint as a reusable workflow node using defineRestNode.
 * Shows the minimal pattern: declare the API, define inputSchema, map the response. No credential.
 * Use this as the starting point whenever you need to call a REST API that isn't in the built-in catalog.
 * @tags defineRestNode custom-api wrap-api rest http get fetch new-endpoint extend style:node
 * @uses defineRestNode, node:getPost
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { defineRestNode } from "@codemation/core-nodes";
import { z } from "zod";

// ----- Step 1: Define the custom node -----
//
// defineRestNode wraps a single REST endpoint as a reusable workflow node.
// It handles URL construction (including {placeholder} substitution), the HTTP call,
// and response deserialization. No credential required for public endpoints.
export const getPost = defineRestNode({
  key: "example.jsonplaceholder.get-post",
  title: "Get Post",
  description: "Fetches a single post from JSONPlaceholder by id.",
  icon: "lucide:globe",
  api: {
    baseUrl: "https://jsonplaceholder.typicode.com",
    // {postId} is substituted from input.postId before the request is sent.
    path: "/posts/{postId}",
    method: "GET",
  },
  // inputSchema validates the per-item input. Values are also used for {placeholder} substitution.
  inputSchema: z.object({
    postId: z.string().describe("ID of the post to fetch (1–100 on JSONPlaceholder)"),
  }),
  // response() maps the raw HTTP response to the node's output JSON.
  // Omit it to receive the full { status, ok, json, text, headers } envelope instead.
  response: ({ json }) => {
    const post = json as { id: number; title: string; body: string; userId: number };
    return {
      postId: post.id,
      title: post.title,
      body: post.body,
      authorId: post.userId,
    };
  },
  // errorPolicy defaults to "throw" — non-2xx responses raise an Error automatically.
});

// ----- Step 2: Use the custom node in a workflow -----

// defineRestNode nodes have no static config — the config object passed to .create() is always {}.
// inputSchema values come from item.json at runtime; the engine validates them before calling execute.
// Ensure item.json matches the inputSchema shape ({ postId: string } here).
export default workflow("example.custom-rest-node-simple")
  .name("Custom REST node: fetch a post (no credential)")
  .manualTrigger<{ postId: string }>("Fetch posts", [{ postId: "1" }, { postId: "42" }])
  // getPost.create({}, label, id) — static config is empty for defineRestNode nodes.
  // The postId is read from item.json.postId automatically at execution time.
  .then(getPost.create({}, "Fetch post", "fetch-post"))
  .build();
