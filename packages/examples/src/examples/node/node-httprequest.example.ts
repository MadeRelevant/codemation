/**
 * @description Manual trigger → HttpRequest GET a JSON API → HttpRequest POST the result to a webhook.
 * Demonstrates both GET and POST patterns: response metadata lands on item.json (ok, status, json, text).
 * @tags http, rest, api, fetch, request, get, post, outbound, style:node
 * @uses @codemation/core-nodes, node:HttpRequest
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { HttpRequest, MapData } from "@codemation/core-nodes";
import type { HttpRequestOutputJson } from "@codemation/core-nodes";

type RepoSummary = Readonly<{
  fullName: string;
  stars: number;
  openIssues: number;
}>;

export default workflow("example.node-httprequest")
  .name("HttpRequest: GET + POST pattern")
  .manualTrigger<unknown>("Fetch and forward", [{}])
  // Use HttpRequest for any outbound HTTP call — GET, POST, PUT, DELETE.
  // The node emits response metadata on item.json: { ok, status, json, text, headers, ... }.
  // For authenticated endpoints, set credentialSlot to a bound bearer/API-key credential.
  .then(
    new HttpRequest("GET GitHub repo", {
      method: "GET",
      url: "https://api.github.com/repos/microsoft/typescript",
      headers: { "User-Agent": "codemation-example" },
    }),
  )
  // Shape the API response into a compact summary before forwarding.
  .then(
    new MapData<HttpRequestOutputJson, RepoSummary>("Extract fields", (item) => {
      const repo = item.json.json as
        | { full_name?: string; stargazers_count?: number; open_issues_count?: number }
        | undefined;
      return {
        fullName: repo?.full_name ?? "unknown",
        stars: repo?.stargazers_count ?? 0,
        openIssues: repo?.open_issues_count ?? 0,
      };
    }),
  )
  // POST the summary to a public echo endpoint.
  // body.kind "json" sets Content-Type: application/json automatically and serialises
  // `data` via JSON.stringify — pass the object directly, not a pre-stringified string.
  .then(
    new HttpRequest("POST summary to webhook", {
      method: "POST",
      url: "https://httpbin.org/post",
      body: {
        kind: "json",
        data: { event: "repo.fetched" },
      },
    }),
  )
  .build();
