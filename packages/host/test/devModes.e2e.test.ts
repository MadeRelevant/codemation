// @vitest-environment node

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { ApiPaths } from "../src/presentation/http/ApiPaths";
import type { WorkflowDto, WorkflowNodeDto } from "../src/application/contracts/WorkflowViewContracts";
import { CodemationPlaywrightUiHarness } from "./playwright/harness/CodemationPlaywrightUiHarness";
import { CodemationPlaywrightHarness } from "./playwright/harness/CodemationPlaywrightHarness";
import { CodemationDevModeServerHarness } from "./e2e/testkit/CodemationDevModeServerHarness";

type RunSummaryJson = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  status: string;
  finishedAt?: string;
}>;

type CredentialInstanceJson = Readonly<{
  instanceId: string;
}>;

class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async start(baseUrl: string): Promise<Page> {
    this.browser = await chromium.launch();
    this.context = await this.browser.newContext({ baseURL: baseUrl });
    this.page = await this.context.newPage();
    return this.page;
  }

  currentPage(): Page {
    assert.ok(this.page, "Expected a started Playwright page.");
    return this.page;
  }

  async stop(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}

class WorkflowApiClient {
  constructor(private readonly page: Page) {}

  async getWorkflow(workflowId: string): Promise<WorkflowDto | null> {
    let response;
    try {
      response = await this.page.request.get(this.toAbsolutePath(ApiPaths.workflow(workflowId)));
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      if (exception.message.includes("ECONNREFUSED")) {
        return null;
      }
      throw exception;
    }
    if (response.status() === 503) {
      return null;
    }
    assert.equal(response.status(), 200, `Expected workflow ${workflowId} to load.`);
    return (await response.json()) as WorkflowDto;
  }

  async waitForWorkflowNodeNamed(args: Readonly<{ workflowId: string; nodeName: string }>): Promise<WorkflowNodeDto> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const workflow = await this.getWorkflow(args.workflowId);
      if (workflow === null) {
        await this.sleep(1_000);
        continue;
      }
      const node = workflow.nodes.find((entry) => entry.name === args.nodeName);
      if (node) {
        return node;
      }
      await this.sleep(1_000);
    }
    throw new Error(`Timed out waiting for workflow ${args.workflowId} node ${args.nodeName}.`);
  }

  async createCredentialInstance(
    args: Readonly<{ typeId: string; displayName: string; secretConfig: Record<string, string> }>,
  ): Promise<string> {
    const response = await this.page.request.post(this.toAbsolutePath(ApiPaths.credentialInstances()), {
      data: {
        typeId: args.typeId,
        displayName: args.displayName,
        sourceKind: "db",
        secretConfig: args.secretConfig,
      },
    });
    assert.equal(response.status(), 200, "Expected credential creation to succeed.");
    const body = (await response.json()) as CredentialInstanceJson;
    return body.instanceId;
  }

  async bindCredential(
    args: Readonly<{ workflowId: string; nodeId: string; slotKey: string; instanceId: string }>,
  ): Promise<void> {
    const response = await this.page.request.put(this.toAbsolutePath(ApiPaths.credentialBindings()), {
      data: args,
    });
    assert.equal(response.status(), 200, "Expected credential binding to succeed.");
  }

  async waitForRunCount(
    args: Readonly<{ workflowId: string; expectedCount: number }>,
  ): Promise<ReadonlyArray<RunSummaryJson>> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await this.page.request.get(this.toAbsolutePath(ApiPaths.workflowRuns(args.workflowId)));
      assert.equal(response.status(), 200, `Expected workflow runs for ${args.workflowId} to load.`);
      const runs = (await response.json()) as RunSummaryJson[];
      if (runs.length >= args.expectedCount) {
        return runs;
      }
      await this.sleep(1_000);
    }
    throw new Error(`Timed out waiting for ${args.expectedCount} runs on workflow ${args.workflowId}.`);
  }

  private toAbsolutePath(relativePath: string): string {
    const origin = new URL(this.page.url()).origin;
    return `${origin}${relativePath}`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

class DevModeE2eTestCase {
  private readonly browserSession = new BrowserSession();
  private readonly mutations: Array<Readonly<{ restore: () => Promise<void> }>> = [];

  constructor(private readonly server: CodemationDevModeServerHarness) {}

  async runFrameworkModeScenario(): Promise<void> {
    await this.server.start();
    try {
      const page = await this.browserSession.start(this.server.baseUrl);
      const ui = new CodemationPlaywrightUiHarness(page);
      const api = new WorkflowApiClient(page);
      await ui.signInWithLocalCredentials();
      await ui.gotoWorkflowsList();
      await ui.openWorkflowFromListAndWaitForWorkflowApiReady("wf.hot-reload-probe");
      await ui.waitForCanvasRunWorkflowButton();

      const initialNode = await api.waitForWorkflowNodeNamed({
        workflowId: "wf.hot-reload-probe",
        nodeName: "Probe",
      });
      await ui.clickCanvasRunWorkflowButton();
      await ui.expectCanvasNodeCompleted(initialNode.id);
      const firstRuns = await api.waitForRunCount({
        workflowId: "wf.hot-reload-probe",
        expectedCount: 1,
      });
      assert.equal(firstRuns[0]?.status, "completed");

      this.mutations.push(
        await this.server.mutateFile("apps/test-dev/src/workflows/dev/hot-reload-probe.ts", (current) =>
          current.replace('new Callback("Probe"', 'new Callback("Probe updated"'),
        ),
      );

      const updatedNode = await api.waitForWorkflowNodeNamed({
        workflowId: "wf.hot-reload-probe",
        nodeName: "Probe updated",
      });
      await page.getByTestId(`canvas-node-card-${updatedNode.id}`).waitFor({ timeout: 120_000 });
      await ui.clickCanvasRunWorkflowButton();
      await ui.expectCanvasNodeCompleted(updatedNode.id);
      const secondRuns = await api.waitForRunCount({
        workflowId: "wf.hot-reload-probe",
        expectedCount: 2,
      });
      assert.equal(secondRuns[0]?.status, "completed");
    } finally {
      await this.cleanup();
    }
  }

  async runPluginModeScenario(): Promise<void> {
    await this.server.start();
    try {
      const page = await this.browserSession.start(this.server.baseUrl);
      const ui = new CodemationPlaywrightUiHarness(page);
      const api = new WorkflowApiClient(page);
      await ui.gotoWorkflowsList();
      await ui.openWorkflowFromListAndWaitForWorkflowApiReady("wf.plugin-dev.http");
      await ui.waitForCanvasRunWorkflowButton();
      await ui.expectNoPersistentRealtimeDisconnect();

      const initialNode = await api.waitForWorkflowNodeNamed({
        workflowId: "wf.plugin-dev.http",
        nodeName: "Fetch demo",
      });
      const credentialInstanceId = await api.createCredentialInstance({
        typeId: "plugin-dev.api-key",
        displayName: "Plugin dev test key",
        secretConfig: { apiKey: "plugin-dev-test-key" },
      });
      await api.bindCredential({
        workflowId: "wf.plugin-dev.http",
        nodeId: initialNode.id,
        slotKey: "pluginDevApiKey",
        instanceId: credentialInstanceId,
      });
      await page.reload();
      await ui.waitForCanvasRunWorkflowButton();
      await ui.clickCanvasRunWorkflowButton();
      await ui.expectCanvasNodeCompleted(initialNode.id);
      const firstRuns = await api.waitForRunCount({
        workflowId: "wf.plugin-dev.http",
        expectedCount: 1,
      });
      assert.equal(firstRuns[0]?.status, "completed");

      this.mutations.push(
        await this.server.mutateFile("apps/plugin-dev/codemation.plugin.ts", (current) =>
          current.replace('new PluginDevHttpDemo("Fetch demo")', 'new PluginDevHttpDemo("Fetch demo updated")'),
        ),
      );

      const updatedNode = await api.waitForWorkflowNodeNamed({
        workflowId: "wf.plugin-dev.http",
        nodeName: "Fetch demo updated",
      });
      await api.bindCredential({
        workflowId: "wf.plugin-dev.http",
        nodeId: updatedNode.id,
        slotKey: "pluginDevApiKey",
        instanceId: credentialInstanceId,
      });
      await page.getByTestId(`canvas-node-card-${updatedNode.id}`).waitFor({ timeout: 120_000 });
      await ui.expectNoPersistentRealtimeDisconnect();
      await ui.clickCanvasRunWorkflowButton();
      await ui.expectCanvasNodeCompleted(updatedNode.id);
      const secondRuns = await api.waitForRunCount({
        workflowId: "wf.plugin-dev.http",
        expectedCount: 2,
      });
      assert.equal(secondRuns[0]?.status, "completed");
    } finally {
      await this.cleanup();
    }
  }

  private async cleanup(): Promise<void> {
    while (this.mutations.length > 0) {
      const mutation = this.mutations.pop();
      await mutation?.restore();
    }
    await this.browserSession.stop();
    await this.server.stop();
  }
}

describe.sequential("dev mode browser e2e", () => {
  const repoRoot = CodemationPlaywrightHarness.resolveRepoRoot();

  it("boots framework dev, hot reloads a workflow node, and runs the updated graph", async () => {
    const testCase = new DevModeE2eTestCase(CodemationDevModeServerHarness.frameworkMode(repoRoot));
    await testCase.runFrameworkModeScenario();
  }, 420_000);

  it("boots plugin dev, hot reloads the plugin workflow node, and runs the updated graph", async () => {
    const testCase = new DevModeE2eTestCase(CodemationDevModeServerHarness.pluginMode(repoRoot));
    await testCase.runPluginModeScenario();
  }, 420_000);
});
