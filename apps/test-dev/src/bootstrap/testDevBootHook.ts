import type { CodemationBootContext, CodemationBootHook } from "@codemation/frontend";
import { injectable } from "@codemation/core";
import { TestDevTokens } from "./testDevTokens";

@injectable()
export class TestDevBootHook implements CodemationBootHook {
  boot(context: CodemationBootContext): void {
    context.container.registerInstance(TestDevTokens.MailKeywords, ["RFQ", "QUOTE", "QUOTATION", "RFP"]);
    context.container.registerInstance(TestDevTokens.OdooBaseUrl, "https://demo.odoo.test");
  }
}
