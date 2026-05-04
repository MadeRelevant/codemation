import { defineRestNode } from "@codemation/core-nodes";
import { bearerTokenCredentialType } from "@codemation/core-nodes";
import { z } from "zod";

/**
 * Example `defineRestNode` usage — a thin wrapper around a single API endpoint.
 *
 * This pattern is the recommended shorthand for plugin authors when a node maps
 * 1:1 to one REST endpoint:
 *
 *  1. Declare the API (`baseUrl`, `path`, `method`).
 *  2. Optionally bind a credential type — the framework handles session resolution.
 *  3. Map `input` to request shape via `request(...)`.
 *  4. Map the HTTP response to output JSON via `response(...)`.
 *
 * Contrast with `ExamplePluginUppercase.ts`, which uses the lower-level `defineNode`
 * for arbitrary logic. Use `defineRestNode` when the node is primarily an HTTP call.
 */
export const exampleRestNode = defineRestNode({
  key: "example-plugin.get-post",
  title: "Get Post",
  description: "Fetches a post from JSONPlaceholder — demonstrates defineRestNode.",
  icon: "lucide:globe",
  api: {
    baseUrl: "https://jsonplaceholder.typicode.com",
    // `{postId}` is substituted from the item's `input.postId` field.
    path: "/posts/{postId}",
    method: "GET",
  },
  // Bind an optional Bearer token credential to the "auth" slot.
  credentials: { auth: { type: bearerTokenCredentialType, optional: true } },
  inputSchema: z.object({ postId: z.string().describe("ID of the post to fetch") }),
  // No custom `request(...)` needed for a simple GET — the path substitution handles it.
  response: ({ json }) => {
    const post = json as { id: number; title: string; body: string; userId: number };
    return {
      postId: post.id,
      title: post.title,
      body: post.body,
      authorId: post.userId,
    };
  },
  // Default errorPolicy is "throw" — non-2xx responses raise an Error.
});
