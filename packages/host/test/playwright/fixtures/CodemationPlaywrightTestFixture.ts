import { test as testBase,type TestInfo } from "@playwright/test";
import { addCoverageReport } from "monocart-reporter";

type CodemationBrowserFixtures = {
  autoTestFixture: string;
};

/**
 * Playwright tests should import `test` / `expect` from this module so V8 browser coverage
 * is collected and merged into the repo's LCOV via monocart-reporter (see playwright.config.ts).
 */
export class CodemationPlaywrightTestFixture {
  static readonly test = testBase.extend<CodemationBrowserFixtures>({
    autoTestFixture: [
      async ({ page }, use, testInfo: TestInfo) => {
        await Promise.all([
          page.coverage.startJSCoverage({ resetOnNavigation: false }),
          page.coverage.startCSSCoverage({ resetOnNavigation: false }),
        ]);
        await use("autoTestFixture");
        const [jsCoverage, cssCoverage] = await Promise.all([
          page.coverage.stopJSCoverage(),
          page.coverage.stopCSSCoverage(),
        ]);
        await addCoverageReport([...jsCoverage, ...cssCoverage], testInfo);
      },
      { scope: "test", auto: true },
    ],
  });
}

export const test = CodemationPlaywrightTestFixture.test;
export { expect } from "@playwright/test";
