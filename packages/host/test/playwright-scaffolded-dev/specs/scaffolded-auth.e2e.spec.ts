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

test("published scaffolded app auth session does not fail during dev startup", async ({ request }, testInfo) => {
  const repoRoot = CodemationPlaywrightHarness.resolveRepoRoot();
  const port = await new LoopbackPortAllocator().allocate();
  const project = new ScaffoldedCreateCodemationProject(repoRoot, defaultTemplateContract, "published");
  let server: ScaffoldedDevServerHarness | null = null;

  try {
    await project.create();
    server = new ScaffoldedDevServerHarness(project.rootPath(), "dev", port, testInfo.outputPath("dev-process"));
    await server.start();
    await server.waitForAuthSessionReady();

    const authSessionResponse = await request.get(`${server.baseUrl()}/api/auth/session`);
    expect(authSessionResponse.status()).toBeLessThan(500);
  } finally {
    if (server) {
      await server.stop();
    }
    await project.dispose();
  }
});
