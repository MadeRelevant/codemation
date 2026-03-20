import { inject,injectable } from "@codemation/core";
import { TestDevOdooEnvironment } from "../bootstrap/TestDevOdooEnvironment";

export interface OdooQuotationDraft {
  readonly baseUrl: string;
  readonly partnerName: string;
  readonly quotationReference: string;
}

@injectable()
export class OdooService {
  constructor(
    @inject(TestDevOdooEnvironment)
    private readonly environment: TestDevOdooEnvironment,
  ) {}

  createQuotationDraft(partnerName: string): OdooQuotationDraft {
    const normalizedPartnerName = partnerName.trim().length > 0 ? partnerName.trim() : "Unknown Partner";
    const sanitizedPartnerName = normalizedPartnerName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return {
      baseUrl: this.environment.baseUrl,
      partnerName: normalizedPartnerName,
      quotationReference: `ODOO-${sanitizedPartnerName || "UNKNOWN"}-DRAFT`,
    };
  }
}
