import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { CodemationPlaywrightHarness } from "../../playwright/harness/CodemationPlaywrightHarness";
import { CodemationPlaywrightUiHarness } from "../../playwright/harness/CodemationPlaywrightUiHarness";
import { LoopbackPortAllocator } from "../../playwright/harness/LoopbackPortAllocator";
import {
  ScaffoldedCreateCodemationProject,
  type ScaffoldedCreateCodemationProjectContract,
} from "../../playwright/harness/ScaffoldedCreateCodemationProject";
import {
  ScaffoldedDevServerHarness,
  type ScaffoldedDevCommandName,
} from "../../playwright/harness/ScaffoldedDevServerHarness";

type ScaffoldedDevScenario = Readonly<{
  name: string;
  commandName: ScaffoldedDevCommandName;
  contract: ScaffoldedCreateCodemationProjectContract;
  executionSummaryPattern: RegExp;
}>;

const scenarios: ReadonlyArray<ScaffoldedDevScenario> = [
  {
    name: "scaffolded app `pnpm dev` opens, runs, and hot-reloads in browser",
    commandName: "dev",
    executionSummaryPattern: /Hello Took/i,
    contract: {
      templateId: "default",
      workflowId: "wf.starter.hello",
      initialWorkflowName: "Starter Hello",
      updatedWorkflowName: "Starter Hello Reloaded",
      sourceFileRelativePath: "src/workflows/starter/hello.ts",
      sourceReplacementBefore: '.name("Starter Hello")',
      sourceReplacementAfter: '.name("Starter Hello Reloaded")',
    },
  },
  {
    name: "scaffolded plugin `pnpm dev:plugin` opens, runs, and hot-reloads in browser",
    commandName: "dev:plugin",
    executionSummaryPattern: /Uppercase message Took/i,
    contract: {
      templateId: "plugin",
      workflowId: "wf.plugin.hello",
      initialWorkflowName: "Plugin Hello",
      updatedWorkflowName: "Plugin Hello Reloaded",
      sourceFileRelativePath: "codemation.plugin.ts",
      sourceReplacementBefore: '.name("Plugin Hello")',
      sourceReplacementAfter: '.name("Plugin Hello Reloaded")',
    },
  },
];

test.describe.configure({ mode: "serial" });

for (const scenario of scenarios) {
  test(scenario.name, async ({ page }, testInfo) => {
    const repoRoot = CodemationPlaywrightHarness.resolveRepoRoot();
    const port = await new LoopbackPortAllocator().allocate();
    const project = new ScaffoldedCreateCodemationProject(repoRoot, scenario.contract);
    const browserConsoleLines: string[] = [];
    page.on("console", (message) => {
      browserConsoleLines.push(`[${message.type()}] ${message.text()}`);
    });
    let server: ScaffoldedDevServerHarness | null = null;
    try {
      await project.create();
      server = new ScaffoldedDevServerHarness(
        project.rootPath(),
        scenario.commandName,
        port,
        testInfo.outputPath("dev-process"),
      );
      server.noteWorkflowRoute(project.workflowId());
      await server.start();
      await server.waitForWorkflowListed(project.workflowId());
      await server.waitForWorkflowPageReady(project.workflowId());

      const ui = new CodemationPlaywrightUiHarness(page);
      await page.goto(server.workflowUrl(project.workflowId()));
      await ui.waitForWorkflowApiReady(project.workflowId());
      await ui.expectWorkflowTitle(project.initialWorkflowName());
      await ui.waitForCanvasRunWorkflowButton();
      await ui.clickCanvasRunWorkflowButton();
      await ui.openExecutionsTab();
      await expect(page.getByRole("treeitem", { name: scenario.executionSummaryPattern })).toBeVisible({
        timeout: 120_000,
      });

      const hotReloadStartedAt = performance.now();
      await project.applyHotReloadEdit();
      await ui.expectWorkflowTitle(project.updatedWorkflowName(), { timeoutMs: 120_000 });
      server.noteHotReloadVisibleLatencyMs(Math.round(performance.now() - hotReloadStartedAt));
    } finally {
      if (browserConsoleLines.length > 0) {
        await writeFile(testInfo.outputPath("browser-console.log"), `${browserConsoleLines.join("\n")}\n`, "utf8");
      }
      if (server) {
        await server.stop();
      }
      await project.dispose();
    }
  });
}
