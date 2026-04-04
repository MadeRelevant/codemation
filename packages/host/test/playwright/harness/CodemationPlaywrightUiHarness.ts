import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Credentials for the user created by {@link CodemationPlaywrightEnvironmentPreparer} (`codemation user create`).
 */
export type CodemationPlaywrightLocalCredentials = Readonly<{
  email: string;
  password: string;
}>;

/**
 * Reusable UI flows for Codemation Playwright specs: login, workflows list, workflow detail readiness.
 * Keeps `data-testid` selectors and wait semantics in one place when the shell changes.
 */
export class CodemationPlaywrightUiHarness {
  static readonly defaultLocalCredentials: CodemationPlaywrightLocalCredentials = {
    email: "e2e@codemation.test",
    password: "E2E-test-password-1!",
  };

  private static readonly loginNavigationTimeoutMs = 60_000;
  private static readonly workflowsListTimeoutMs = 60_000;
  private static readonly workflowApiReadyTimeoutMs = 120_000;
  private static readonly canvasRunButtonTimeoutMs = 60_000;
  private static readonly canvasNodeCompletionTimeoutMs = 120_000;

  constructor(private readonly page: Page) {}

  /**
   * Full local-credentials login: `/login`, fill fields, submit, wait until URL leaves `/login` or surface `login-error`.
   */
  async signInWithLocalCredentials(
    credentials: CodemationPlaywrightLocalCredentials = CodemationPlaywrightUiHarness.defaultLocalCredentials,
  ): Promise<void> {
    await this.page.goto("/login");
    await expect(this.page.getByTestId("login-page")).toBeVisible();
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.getByTestId("login-email").fill(credentials.email);
    await this.page.getByTestId("login-password").fill(credentials.password);
    await this.page.getByTestId("login-submit").click({ force: true });
    try {
      await this.page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: CodemationPlaywrightUiHarness.loginNavigationTimeoutMs,
      });
    } catch (error) {
      const loginError = this.page.getByTestId("login-error");
      if (await loginError.isVisible()) {
        throw new Error(`Login UI error: ${(await loginError.textContent()) ?? ""}`, { cause: error });
      }
      throw error;
    }
  }

  /** Navigate to `/workflows` and wait until the list shell is ready. */
  async gotoWorkflowsList(): Promise<void> {
    await this.page.goto("/workflows");
    await expect(this.page.getByTestId("workflows-list")).toBeVisible({
      timeout: CodemationPlaywrightUiHarness.workflowsListTimeoutMs,
    });
  }

  async expectWorkflowListItemVisible(workflowId: string, workflowName: string): Promise<void> {
    const item = this.page.getByTestId(`workflow-list-item-${workflowId}`);
    await expect(item).toBeVisible({ timeout: CodemationPlaywrightUiHarness.workflowsListTimeoutMs });
    await expect(item).toContainText(workflowName, { timeout: CodemationPlaywrightUiHarness.workflowsListTimeoutMs });
  }

  /**
   * From the workflows list, open a workflow and poll until `GET /api/workflows/:id` returns 200
   * (handles transient 503 while the runtime gateway attaches).
   */
  async openWorkflowFromListAndWaitForWorkflowApiReady(
    workflowId: string,
    options?: Readonly<{ apiReadyTimeoutMs?: number }>,
  ): Promise<void> {
    await this.page.getByTestId(`workflow-open-${workflowId}`).click();
    await this.waitForWorkflowApiReady(workflowId, options);
  }

  async waitForWorkflowApiReady(workflowId: string, options?: Readonly<{ apiReadyTimeoutMs?: number }>): Promise<void> {
    const apiReadyTimeoutMs = options?.apiReadyTimeoutMs ?? CodemationPlaywrightUiHarness.workflowApiReadyTimeoutMs;
    await expect
      .poll(
        async () => {
          const origin = new URL(this.page.url()).origin;
          const res = await this.page.request.get(`${origin}/api/workflows/${workflowId}`);
          return res.status();
        },
        { timeout: apiReadyTimeoutMs },
      )
      .toBe(200);
  }

  /** Workflow detail / canvas: primary run control is visible. */
  async waitForCanvasRunWorkflowButton(options?: Readonly<{ timeoutMs?: number }>): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? CodemationPlaywrightUiHarness.canvasRunButtonTimeoutMs;
    await expect(this.canvasRunWorkflowButton()).toBeVisible({ timeout: timeoutMs });
  }

  async clickCanvasRunWorkflowButton(): Promise<void> {
    await this.canvasRunWorkflowButton().click();
  }

  async openExecutionsTab(): Promise<void> {
    await this.page.getByTestId("workflow-canvas-tab-executions").click();
  }

  /**
   * Clicks a canvas node card by index (0-based DOM order) and returns that node's id. Needed so the
   * execution inspector mounts when nothing is auto-selected after a run.
   */
  async selectCanvasNodeByCardIndex(index: number, options?: Readonly<{ timeoutMs?: number }>): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? CodemationPlaywrightUiHarness.canvasNodeCompletionTimeoutMs;
    const cards = this.page.locator('[data-testid^="canvas-node-card-"]');
    const card = cards.nth(index);
    await expect(card).toBeVisible({ timeout: timeoutMs });
    const testId = await card.getAttribute("data-testid");
    const nodeId = testId?.replace(/^canvas-node-card-/, "") ?? "";
    if (!nodeId) {
      throw new Error(`Missing canvas node id for card index ${String(index)} (testid=${testId ?? "null"})`);
    }
    await card.click();
    return nodeId;
  }

  async expectWorkflowTitle(name: string, options?: Readonly<{ timeoutMs?: number }>): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? CodemationPlaywrightUiHarness.workflowApiReadyTimeoutMs;
    await expect(this.page.getByTestId("workflow-detail-workflow-title")).toHaveText(name, { timeout: timeoutMs });
  }

  async expectLatestRunCompleted(options?: Readonly<{ timeoutMs?: number }>): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? CodemationPlaywrightUiHarness.canvasNodeCompletionTimeoutMs;
    const runsSidebar = this.page.getByTestId("workflow-runs-sidebar");
    await expect(runsSidebar).toBeVisible({ timeout: timeoutMs });
    await expect
      .poll(async () => await runsSidebar.locator('[data-testid^="run-status-"]').allTextContents(), {
        timeout: timeoutMs,
      })
      .toContain("completed");
  }

  async selectLatestRunFromSidebar(options?: Readonly<{ timeoutMs?: number }>): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? CodemationPlaywrightUiHarness.canvasNodeCompletionTimeoutMs;
    const readySurface = await this.waitForRunSelectionSurface(timeoutMs);
    if (readySurface === "inspector") {
      return "live-execution";
    }
    const runsSidebar = this.page.getByTestId("workflow-runs-sidebar");
    await expect(runsSidebar).toBeVisible({ timeout: timeoutMs });
    const latestRun = runsSidebar.locator('[data-testid^="run-summary-"]').first();
    await expect(latestRun).toBeVisible({ timeout: timeoutMs });
    const testId = await latestRun.getAttribute("data-testid");
    const runId = testId?.replace(/^run-summary-/, "") ?? "";
    if (!runId) {
      throw new Error(`Missing run id for latest run summary (testid=${testId ?? "null"})`);
    }
    await latestRun.click();
    return runId;
  }

  /** Assert a canvas node card exists and reaches `completed` (runtime finished for that node). */
  async expectCanvasNodeCompleted(
    nodeId: string,
    options?: Readonly<{ visibleTimeoutMs?: number; statusTimeoutMs?: number }>,
  ): Promise<void> {
    const card = this.page.getByTestId(`canvas-node-card-${nodeId}`);
    const visibleTimeoutMs = options?.visibleTimeoutMs ?? CodemationPlaywrightUiHarness.canvasNodeCompletionTimeoutMs;
    const statusTimeoutMs = options?.statusTimeoutMs ?? CodemationPlaywrightUiHarness.canvasNodeCompletionTimeoutMs;
    await expect(card).toBeVisible({ timeout: visibleTimeoutMs });
    await expect(card).toHaveAttribute("data-codemation-node-status", "completed", { timeout: statusTimeoutMs });
  }

  private canvasRunWorkflowButton() {
    return this.page.getByTestId("canvas-run-workflow-button").last();
  }

  private async waitForRunSelectionSurface(timeoutMs: number): Promise<"sidebar" | "inspector"> {
    const pollIntervalMs = 250;
    const attempts = Math.ceil(timeoutMs / pollIntervalMs);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if ((await this.page.getByTestId("workflow-runs-sidebar").count()) > 0) {
        return "sidebar";
      }
      const executionTreeNode = this.page.locator('[data-testid^="execution-tree-node-"]').first();
      if ((await executionTreeNode.count()) > 0 && (await this.page.getByTestId("selected-node-name").count()) > 0) {
        await expect(executionTreeNode).toBeVisible({ timeout: 5_000 });
        await expect(this.page.getByTestId("selected-node-name")).toBeVisible({ timeout: 5_000 });
        return "inspector";
      }
      await this.page.waitForTimeout(pollIntervalMs);
    }
    throw new Error(`Timed out after ${String(timeoutMs)}ms waiting for the run sidebar or execution inspector.`);
  }
}
