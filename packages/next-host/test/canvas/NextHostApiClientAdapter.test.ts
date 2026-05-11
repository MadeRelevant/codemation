import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codemationApiClient } from "../../src/api/CodemationApiClient";
import { NextHostApiClientAdapter } from "../../src/features/workflows/canvas-adapter/NextHostApiClientAdapter";

describe("NextHostApiClientAdapter", () => {
  const originals = {
    getJson: codemationApiClient.getJson.bind(codemationApiClient),
    postJson: codemationApiClient.postJson.bind(codemationApiClient),
    patchJson: codemationApiClient.patchJson.bind(codemationApiClient),
    putJson: codemationApiClient.putJson.bind(codemationApiClient),
    postFormData: codemationApiClient.postFormData.bind(codemationApiClient),
  };

  let adapter: NextHostApiClientAdapter;
  const getJsonUrls: string[] = [];
  const postJsonUrls: string[] = [];
  const patchJsonUrls: string[] = [];
  const putJsonUrls: string[] = [];
  const postFormDataUrls: string[] = [];

  beforeEach(() => {
    adapter = new NextHostApiClientAdapter();
    getJsonUrls.length = 0;
    postJsonUrls.length = 0;
    patchJsonUrls.length = 0;
    putJsonUrls.length = 0;
    postFormDataUrls.length = 0;

    codemationApiClient.getJson = async <T>(url: string): Promise<T> => {
      getJsonUrls.push(url);
      return [] as T;
    };
    codemationApiClient.postJson = async <T>(url: string): Promise<T> => {
      postJsonUrls.push(url);
      return {} as T;
    };
    codemationApiClient.patchJson = async <T>(url: string): Promise<T> => {
      patchJsonUrls.push(url);
      return {} as T;
    };
    codemationApiClient.putJson = async <T>(url: string): Promise<T> => {
      putJsonUrls.push(url);
      return {} as T;
    };
    codemationApiClient.postFormData = async <T>(url: string): Promise<T> => {
      postFormDataUrls.push(url);
      return {} as T;
    };
  });

  afterEach(() => {
    Object.assign(codemationApiClient, originals);
  });

  it("fetchTelemetryRunTrace delegates to the telemetry trace endpoint", async () => {
    await adapter.fetchTelemetryRunTrace("run_1");
    expect(getJsonUrls[0]).toContain("/api/telemetry/runs/run_1/trace");
  });

  it("fetchCredentialTypes delegates to the credential types endpoint", async () => {
    await adapter.fetchCredentialTypes();
    expect(getJsonUrls[0]).toContain("/api/credentials/types");
  });

  it("fetchCredentialFieldEnvStatus delegates to the credentials env-status endpoint", async () => {
    await adapter.fetchCredentialFieldEnvStatus();
    expect(getJsonUrls[0]).toContain("/api/credentials");
  });

  it("fetchCredentialInstances delegates to the credential instances endpoint", async () => {
    await adapter.fetchCredentialInstances();
    expect(getJsonUrls[0]).toContain("/api/credentials");
  });

  it("fetchCredentialInstanceWithSecrets delegates to the credential instance endpoint", async () => {
    await adapter.fetchCredentialInstanceWithSecrets("inst_1");
    expect(getJsonUrls[0]).toContain("inst_1");
  });

  it("fetchWorkflowCredentialHealth delegates to the workflow credential health endpoint", async () => {
    await adapter.fetchWorkflowCredentialHealth("wf_1");
    expect(getJsonUrls[0]).toContain("wf_1");
  });

  it("fetchUserAccounts delegates to the users endpoint", async () => {
    const result = await adapter.fetchUserAccounts();
    expect(getJsonUrls[0]).toContain("/api/users");
    expect(result).toEqual([]);
  });

  it("fetchWorkflowTestSuiteRuns delegates to the test suite runs endpoint", async () => {
    await adapter.fetchWorkflowTestSuiteRuns("wf_1");
    expect(getJsonUrls[0]).toContain("wf_1");
  });

  it("fetchTestSuiteRunDetail delegates to the test suite run endpoint", async () => {
    await adapter.fetchTestSuiteRunDetail("suite_1");
    expect(getJsonUrls[0]).toContain("suite_1");
  });

  it("fetchTestSuiteRunAssertions delegates to the assertions endpoint", async () => {
    await adapter.fetchTestSuiteRunAssertions("suite_1");
    expect(getJsonUrls[0]).toContain("suite_1");
  });

  it("fetchRunAssertions delegates to the run assertions endpoint", async () => {
    await adapter.fetchRunAssertions("run_1");
    expect(getJsonUrls[0]).toContain("run_1");
  });

  it("fetchTestSuiteRunChildRuns delegates to the child runs endpoint", async () => {
    await adapter.fetchTestSuiteRunChildRuns("suite_1");
    expect(getJsonUrls[0]).toContain("suite_1");
  });

  it("fetchAssertionMetricTrends delegates to the metric trends endpoint", async () => {
    await adapter.fetchAssertionMetricTrends("wf_1");
    expect(getJsonUrls[0]).toContain("wf_1");
  });

  it("postStartTestSuiteRun posts to the test suite runs endpoint", async () => {
    await adapter.postStartTestSuiteRun("wf_1", { triggerNodeId: "node_1" });
    expect(postJsonUrls[0]).toContain("wf_1");
  });

  it("patchWorkflowActivation patches the activation endpoint", async () => {
    await adapter.patchWorkflowActivation("wf_1", true);
    expect(patchJsonUrls[0]).toContain("wf_1");
  });

  it("postUserInvite posts to the user invites endpoint", async () => {
    await adapter.postUserInvite("user@example.com");
    expect(postJsonUrls[0]).toContain("/api/users/invites");
  });

  it("postUserInviteRegenerate posts to the invite regenerate endpoint", async () => {
    await adapter.postUserInviteRegenerate("user_1");
    expect(postJsonUrls[0]).toContain("user_1");
  });

  it("patchUserStatus patches the user status endpoint", async () => {
    await adapter.patchUserStatus("user_1", "active");
    expect(patchJsonUrls[0]).toContain("user_1");
  });

  it("postWorkflowDebuggerOverlayBinaryUpload uploads via form data", async () => {
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    await adapter.postWorkflowDebuggerOverlayBinaryUpload("wf_1", {
      nodeId: "node_1",
      itemIndex: 0,
      attachmentName: "test.txt",
      file,
    });
    expect(postFormDataUrls[0]).toContain("wf_1");
  });
});
