export const runtime = "nodejs";

import { codemationHost } from "../_codemation/codemationHost";

export async function GET(): Promise<Response> {
  const ctx = await codemationHost.get();
  await ctx.ensureStarted();

  const encoder = new TextEncoder();
  let sub: { close: () => Promise<void> } | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      sub = await ctx.eventBus.subscribe((event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      });

      controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));
    },
    cancel: async (reason) => {
      void reason;
      await sub?.close();
      sub = undefined;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

