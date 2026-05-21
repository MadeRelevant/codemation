/**
 * Regression tests for Sprint 13 Story G — three browser-visible bugs on the
 * workflow detail / canvas screen.
 *
 * Requires wf.e2e.agent-mcp to be registered in apps/e2e (uses CronTrigger +
 * AIAgent with mcpServers: ["gmail"]) so all three regressions can be exercised
 * from a single canvas load.
 *
 * Bug 1 — Hydration mismatch on canvas mount:
 *   Server renders <DefaultLoadingState> ("Loading diagram…"), client immediately
 *   renders the real canvas div. suppressHydrationWarning on the parent wrapper
 *   doesn't propagate to the first child, so React throws an uncaught console error.
 *   Assert: no "Hydration failed" console error appears after navigation.
 *
 * Bug 2 — clock.svg 404:
 *   CronTrigger sets icon: "lucide:clock". "clock" is not in the curated
 *   WorkflowCanvasLucideIconRegistry, so it falls through to the remote glyph
 *   path which fetches /api/lucide-icon/clock.svg. Assert: all /api/lucide-icon/*
 *   requests return 200.
 *
 * Bug 3 — MCP attachment node not selectable:
 *   PersistedWorkflowSnapshotMapper.toTopLevelNodes early-returns when
 *   allConnectionChildrenMaterialized() is true (connection-slot children exist),
 *   skipping toAttachmentNodes() which is the only path that emits MCP nodes.
 *   Assert: a node whose id contains "__conn__mcp__" is visible on the canvas and
 *   clicking it opens the node properties panel.
 */

import { test, expect } from "../fixtures/CodemationPlaywrightTestFixture";
import { CodemationPlaywrightUiHarness } from "../harness/CodemationPlaywrightUiHarness";

const AGENT_MCP_WORKFLOW_ID = "wf.e2e.agent-mcp";

test.describe("workflow detail screen regressions (Sprint 13 Story G)", () => {
  test("Bug 1: no hydration mismatch console error on canvas mount", async ({ page }) => {
    const ui = new CodemationPlaywrightUiHarness(page);

    // Collect console errors before navigating.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await ui.signInWithLocalCredentials();
    await ui.waitForWorkflowApiReady(AGENT_MCP_WORKFLOW_ID);
    await page.goto(`/workflows/${encodeURIComponent(AGENT_MCP_WORKFLOW_ID)}`);
    // Give the page time to mount and potentially fire hydration errors.
    await page.waitForLoadState("networkidle");

    const hydrationErrors = consoleErrors.filter(
      (msg) => msg.toLowerCase().includes("hydration") || msg.toLowerCase().includes("minified react error"),
    );
    expect(hydrationErrors, `Expected no hydration errors, got: ${hydrationErrors.join("; ")}`).toHaveLength(0);
  });

  test("Bug 2: no 404 for /api/lucide-icon/* requests (clock.svg)", async ({ page }) => {
    const ui = new CodemationPlaywrightUiHarness(page);

    const lucideIcon404s: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/lucide-icon/") && response.status() !== 200) {
        lucideIcon404s.push(`${response.status()} ${response.url()}`);
      }
    });

    await ui.signInWithLocalCredentials();
    await ui.waitForWorkflowApiReady(AGENT_MCP_WORKFLOW_ID);
    await page.goto(`/workflows/${encodeURIComponent(AGENT_MCP_WORKFLOW_ID)}`);

    // Wait for canvas root to appear so icon requests have been issued.
    await expect(page.locator('[data-testid="workflow-canvas-root"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    expect(
      lucideIcon404s,
      `Expected all /api/lucide-icon/* to be 200, failed: ${lucideIcon404s.join("; ")}`,
    ).toHaveLength(0);
  });

  test("Bug 3: MCP attachment node is visible and opens the properties panel on click", async ({ page }) => {
    const ui = new CodemationPlaywrightUiHarness(page);
    await ui.signInWithLocalCredentials();
    await ui.waitForWorkflowApiReady(AGENT_MCP_WORKFLOW_ID);
    await page.goto(`/workflows/${encodeURIComponent(AGENT_MCP_WORKFLOW_ID)}`);

    // Wait for the canvas to mount.
    await expect(page.locator('[data-testid="workflow-canvas-root"]')).toBeVisible({ timeout: 30_000 });

    // The MCP attachment node id contains "__conn__mcp__" per ConnectionNodeIdFactory.
    // The node is rendered as a ReactFlow node; its card has data-testid="canvas-node-card-<nodeId>".
    const mcpCard = page.locator('[data-testid^="canvas-node-card-"][data-testid*="__conn__mcp__"]');

    await expect(mcpCard).toBeVisible({ timeout: 30_000 });

    // Click the MCP node and verify the properties panel opens.
    await mcpCard.click();
    await expect(page.locator('[data-testid="node-properties-panel"]')).toBeVisible({ timeout: 10_000 });
  });
});
