/**
 * @description Manual trigger → rate-limited HttpRequest calls separated by a Wait pause.
 * Demonstrates Wait as the primary delay node: pauses execution for a fixed duration before passing items through unchanged.
 * @tags wait, delay, rate-limit, pause, throttle, sleep, timing, style:node
 * @uses @codemation/core-nodes, node:Wait
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { Wait, HttpRequest, MapData } from "@codemation/core-nodes";
import type { HttpRequestOutputJson } from "@codemation/core-nodes";

type SearchQuery = Readonly<{ query: string }>;

type SearchResult = Readonly<{
  query: string;
  status: number;
  ok: boolean;
}>;

export default workflow("example.node-wait")
  .name("Wait: rate-limit API calls with a 1-second pause")
  .manualTrigger<SearchQuery>("Search queries", [{ query: "typescript patterns" }, { query: "codemation workflows" }])
  // Use Wait to respect API rate limits or introduce deliberate delays between retries.
  // The node passes all items through unchanged after pausing for `milliseconds`.
  // 1000 ms = 1 second; adjust to match the target API's rate limit window.
  .then(new Wait("Rate-limit pause", 1000))
  .then(
    new HttpRequest("Search API", {
      method: "GET",
      url: "https://api.example.com/search",
      query: { q: "typescript" },
      headers: { "User-Agent": "codemation-example" },
    }),
  )
  .then(
    new MapData<HttpRequestOutputJson, SearchResult>("Extract result", (item) => ({
      query: "typescript",
      status: item.json.status,
      ok: item.json.ok,
    })),
  )
  .build();
