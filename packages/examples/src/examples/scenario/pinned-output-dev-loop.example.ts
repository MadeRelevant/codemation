/**
 * @description Workflow with an HTTP API call node where the output is pinned in the canvas.
 * Pin is UI-side only: use the canvas "Pin output" button on the HttpRequest node to freeze its
 * output. Downstream nodes then iterate on stable data without re-calling the live API on each run.
 * This speeds up the dev loop when tuning prompt or transform logic downstream of a slow API call.
 * No code-side DSL for pinning exists — the pin lives in canvas state (pinnedOutputsByPort).
 * @tags pinned-output, dev-loop, iteration, debugging, canvas, http, development, workflow, freeze, style:scenario
 * @uses @codemation/core-nodes, node:HttpRequest, node:MapData
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { HttpRequest, MapData } from "@codemation/core-nodes";
import type { HttpRequestOutputJson } from "@codemation/core-nodes";

type GitHubRepo = Readonly<{
  id: number;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
}>;

type RepoSummary = Readonly<{
  name: string;
  stars: number;
  language: string;
  description: string;
}>;

export default workflow("example.pinned-output-dev-loop")
  .name("Pinned output: GitHub API → transform (dev-loop demo)")
  .manualTrigger<unknown>("Fetch repo", [{}])
  // ↓ Pin the output of this node in the canvas to freeze the API response.
  //   Click the node → "Pin output" in the inspector. Subsequent manual runs
  //   replay the pinned data instead of calling the API again.
  .then(
    new HttpRequest("Fetch GitHub repo", {
      method: "GET",
      url: "https://api.github.com/repos/microsoft/vscode",
      headers: { "User-Agent": "codemation-example" },
    }),
  )
  // Iterate freely on this transform step — the API call above stays frozen.
  .then(
    new MapData<HttpRequestOutputJson, RepoSummary>("Shape repo summary", (item) => {
      const repo = item.json.json as GitHubRepo | undefined;
      return {
        name: repo?.full_name ?? "unknown",
        stars: repo?.stargazers_count ?? 0,
        language: repo?.language ?? "unknown",
        description: repo?.description ?? "",
      };
    }),
  )
  .build();
