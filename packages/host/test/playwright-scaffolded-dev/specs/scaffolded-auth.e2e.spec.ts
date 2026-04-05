import { expect, test } from "@playwright/test";

import { CodemationPlaywrightHarness } from "../../playwright/harness/CodemationPlaywrightHarness";
import { LoopbackPortAllocator } from "../../playwright/harness/LoopbackPortAllocator";
import {
  ScaffoldedCreateCodemationProject,
  type ScaffoldedCreateCodemationProjectContract,
} from "../../playwright/harness/ScaffoldedCreateCodemationProject";
import { ScaffoldedDevServerHarness } from "../../playwright/harness/ScaffoldedDevServerHarness";

const defaultTemplateContract: ScaffoldedCreateCodemationProjectContract = {
  templateId: "default",
  workflowId: "wf.starter.hello",
  initialWorkflowName: "Starter Hello",
  updatedWorkflowName: "Starter Hello Reloaded",
  sourceFileRelativePath: "src/workflows/starter/hello.ts",
  sourceReplacementBefore: '.name("Starter Hello")',
  sourceReplacementAfter: '.name("Starter Hello Reloaded")',
};

test.describe.configure({ mode: "serial" });

test("published scaffolded app auth session boots and local login reaches workflows", async ({
  page,
  request,
}, testInfo) => {
  const repoRoot = CodemationPlaywrightHarness.resolveRepoRoot();
  const port = await new LoopbackPortAllocator().allocate();
  const project = new ScaffoldedCreateCodemationProject(repoRoot, defaultTemplateContract, "packed");
  let server: ScaffoldedDevServerHarness | null = null;

  try {
    await project.create();
    server = new ScaffoldedDevServerHarness(project.rootPath(), "dev", port, testInfo.outputPath("dev-process"));
    await server.start();
    await server.waitForAuthSessionReady();
    await server.waitForWorkflowListed(project.workflowId());

    const authSessionResponse = await request.get(`${server.baseUrl()}/api/auth/session`);
    expect(authSessionResponse.status()).toBeLessThan(500);

    const credentials = project.adminCredentials();
    await page.goto(`${server.baseUrl()}/login?callbackUrl=/workflows`);
    await expect(page.getByTestId("login-page")).toBeVisible();
    await page.getByTestId("login-email").fill(credentials.email);
    await page.getByTestId("login-password").fill(credentials.password);
    await page.getByTestId("login-submit").click({ force: true });
    await page.waitForURL(`${server.baseUrl()}/workflows`, { timeout: 60_000 });
    await expect(page.getByTestId("workflows-list")).toBeVisible();
    await expect(page.getByTestId(`workflow-list-item-${project.workflowId()}`)).toBeVisible();
  } finally {
    if (server) {
      await server.stop();
    }
    await project.dispose();
  }
});
