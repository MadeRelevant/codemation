import { CodemationPlaywrightUiHarness } from "../harness/CodemationPlaywrightUiHarness";
import { test } from "../fixtures/CodemationPlaywrightTestFixture";

const e2eWorkflowId = "wf.e2e.ab";

test.describe("browser e2e (pgsql, local scheduler)", () => {
  test("login, list workflows, open canvas, run A → B", async ({ page }) => {
    const ui = new CodemationPlaywrightUiHarness(page);
    await ui.signInWithLocalCredentials();
    await ui.gotoWorkflowsList();
    await ui.openWorkflowFromListAndWaitForWorkflowApiReady(e2eWorkflowId);
    await ui.waitForCanvasRunWorkflowButton();
    await ui.clickCanvasRunWorkflowButton();
    await ui.expectCanvasNodeCompleted("B");
  });
});
