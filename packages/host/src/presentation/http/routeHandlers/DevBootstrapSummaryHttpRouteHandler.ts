import { inject, injectable } from "@codemation/core";
import { DevBootstrapSummaryAssembler } from "../../../application/dev/DevBootstrapSummaryAssembler";

@injectable()
export class DevBootstrapSummaryHttpRouteHandler {
  constructor(@inject(DevBootstrapSummaryAssembler) private readonly assembler: DevBootstrapSummaryAssembler) {}

  getSummary(): Response {
    const payload = this.assembler.assemble();
    if (!payload) {
      return new Response(JSON.stringify({ error: "Runtime summary not ready" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}
