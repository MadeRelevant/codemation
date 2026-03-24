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

  /**
   * From the workflows list, open a workflow and poll until `GET /api/workflows/:id` returns 200
   * (handles transient 503 while the runtime gateway attaches).
   */
  async openWorkflowFromListAndWaitForWorkflowApiReady(
    workflowId: string,
    options?: Readonly<{ apiReadyTimeoutMs?: number }>,
  ): Promise<void> {
    await this.page.getByTestId(`workflow-open-${workflowId}`).click();
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
  async waitForCanvasRunWorkflowButton(
    options?: Readonly<{ timeoutMs?: number }>,
  ): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? CodemationPlaywrightUiHarness.canvasRunButtonTimeoutMs;
    await expect(this.page.getByTestId("canvas-run-workflow-button")).toBeVisible({ timeout: timeoutMs });
  }

  async clickCanvasRunWorkflowButton(): Promise<void> {
    await this.page.getByTestId("canvas-run-workflow-button").click();
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
}
