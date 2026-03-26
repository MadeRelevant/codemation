import { describe, expect, it } from "vitest";

import { DevGatewayBuildLifecycleBroadcastPayloads } from "../src/DevGatewayBuildLifecycleBroadcastPayloads";

describe("DevGatewayBuildLifecycleBroadcastPayloads", () => {
  it("resolves buildVersion from notify payload when present", () => {
    expect(
      DevGatewayBuildLifecycleBroadcastPayloads.resolveBuildVersionFromNotifyPayload({
        buildVersion: "  rel-1  ",
      }),
    ).toBe("rel-1");
  });

  it("uses a gateway fallback when buildVersion is missing", () => {
    const resolved = DevGatewayBuildLifecycleBroadcastPayloads.resolveBuildVersionFromNotifyPayload({});
    expect(resolved).toMatch(/^\d+-gateway$/);
  });

  it("exposes devBuildCompleted on the dev socket and per workflow room with matching buildVersion (regression)", () => {
    const buildVersion = "cli-2026-01-01";
    expect(DevGatewayBuildLifecycleBroadcastPayloads.devSocketDevBuildCompleted(buildVersion)).toEqual({
      kind: "devBuildCompleted",
      buildVersion,
    });
    expect(
      DevGatewayBuildLifecycleBroadcastPayloads.workflowRoomDevBuildCompleted("wf.gmail.pull", buildVersion),
    ).toEqual({
      kind: "devBuildCompleted",
      workflowId: "wf.gmail.pull",
      buildVersion,
    });
  });
});
