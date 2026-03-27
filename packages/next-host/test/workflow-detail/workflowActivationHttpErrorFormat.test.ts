import { describe, expect, it } from "vitest";

import { CodemationApiHttpError } from "../../src/api/CodemationApiHttpError";
import { WorkflowActivationHttpErrorFormat } from "../../src/features/workflows/lib/workflowDetail/WorkflowActivationHttpErrorFormat";

describe("WorkflowActivationHttpErrorFormat", () => {
  const format = new WorkflowActivationHttpErrorFormat();

  it("prefers the errors array from a JSON error body", () => {
    const messages = format.extractMessages(
      new CodemationApiHttpError(
        400,
        JSON.stringify({
          error: "Workflow cannot be activated.",
          errors: ["Missing trigger", "Missing credential"],
        }),
      ),
    );
    expect(messages).toEqual(["Missing trigger", "Missing credential"]);
  });

  it("falls back to the summary error string", () => {
    const messages = format.extractMessages(
      new CodemationApiHttpError(400, JSON.stringify({ error: "Only manual trigger" })),
    );
    expect(messages).toEqual(["Only manual trigger"]);
  });
});
