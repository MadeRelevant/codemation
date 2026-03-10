import type { CodemationBootHook, CodemationBootstrapContext } from "@codemation/application";
import { injectable } from "@codemation/core";
import { TestDevTokens } from "./testDevTokens";

@injectable()
export class TestDevBootHook implements CodemationBootHook {
  boot(context: CodemationBootstrapContext): void {
    context.container.registerInstance(TestDevTokens.MailKeywords, ["RFQ", "QUOTE", "QUOTATION", "RFP"]);
  }
}
