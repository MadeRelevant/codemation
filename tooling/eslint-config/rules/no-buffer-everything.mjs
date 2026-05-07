/**
 * ESLint rule: codemation/no-buffer-everything
 *
 * Flags patterns that silently load entire payloads into RAM, making the
 * process vulnerable to OOM when processing multi-GB attachments or large
 * HTTP responses. The framework's binary API and fetch both natively support
 * streaming (BinaryBody = ReadableStream | AsyncIterable | Uint8Array | ArrayBuffer),
 * so callers should prefer passing a stream through rather than materialising it.
 *
 * Flagged patterns:
 *   Buffer.from(<expr>, "base64")  — decodes entire payload into RAM
 *   <expr>.arrayBuffer()           — materialises whole HTTP response body
 *   Buffer.concat(<arr>)           — typically follows a chunk-accumulation loop
 */

/** @type {import("eslint").Rule.RuleModule} */
const noBufferEverything = {
  meta: {
    type: "problem",
    docs: {
      description: "flag patterns that silently load entire binary payloads into RAM, defeating streaming",
      url: "https://github.com/maderelevant/codemation",
    },
    schema: [],
    messages: {
      bufferFromBase64:
        "Buffer.from(x, 'base64') decodes the entire payload into RAM. " +
        "For attachments / responses, consume the source as a stream. " +
        "Suppress with `// eslint-disable-next-line codemation/no-buffer-everything -- <reason>` if buffering is genuinely required.",
      arrayBuffer:
        ".arrayBuffer() materialises the whole HTTP response body. " +
        "Pass `response.body` (a ReadableStream) directly to `ctx.binary.attach`/`fetch` instead.",
      bufferConcat:
        "Buffer.concat() typically follows a chunk-accumulation loop that defeats streaming. " +
        "If you really need the merged buffer, suppress with a justification.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // ---- Buffer.from(x, "base64") ----
        if (
          node.callee.type === "MemberExpression" &&
          !node.callee.computed &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Buffer" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "from" &&
          node.arguments.length >= 2
        ) {
          const secondArg = node.arguments[1];
          if (
            secondArg &&
            secondArg.type === "Literal" &&
            typeof secondArg.value === "string" &&
            secondArg.value.toLowerCase() === "base64"
          ) {
            context.report({ node, messageId: "bufferFromBase64" });
          }
        }

        // ---- <expr>.arrayBuffer() ----
        if (
          node.callee.type === "MemberExpression" &&
          !node.callee.computed &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "arrayBuffer" &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: "arrayBuffer" });
        }

        // ---- Buffer.concat(<arr>) ----
        if (
          node.callee.type === "MemberExpression" &&
          !node.callee.computed &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Buffer" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "concat"
        ) {
          context.report({ node, messageId: "bufferConcat" });
        }
      },
    };
  },
};

export default noBufferEverything;
