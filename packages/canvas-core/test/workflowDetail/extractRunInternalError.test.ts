import { describe, it, expect } from "vitest";

import { extractRunInternalError } from "../../src/hooks/workflowDetail/useWorkflowRunController";
import { CodemationApiHttpError } from "../../src/lib/CodemationApiHttpError";

describe("extractRunInternalError", () => {
  it("parses the full ServerHttpUnhandledErrorPayload from a 500 body", () => {
    // Regression test: when the host's run-workflow command throws "Metadata scope doesn't allow
    // format FULL" (a real Gmail-API error we hit during dev), the canvas must surface the full
    // message + stack so the operator can copy/paste it into a bug report instead of digging
    // through the CLI log.
    const body = JSON.stringify({
      error: "Internal server error",
      message: "Metadata scope doesn't allow format FULL",
      name: "Error",
      stack: "Error: Metadata scope doesn't allow format FULL\n    at Gaxios._request (...)",
      cause: "[object Object]",
    });
    const result = extractRunInternalError(new CodemationApiHttpError(500, body));
    expect(result).not.toBeNull();
    expect(result?.message).toBe("Metadata scope doesn't allow format FULL");
    expect(result?.name).toBe("Error");
    expect(result?.stack).toContain("Gaxios._request");
    expect(result?.cause).toBe("[object Object]");
  });

  it("returns null for non-HTTP errors (e.g. network failures)", () => {
    expect(extractRunInternalError(new Error("network down"))).toBeNull();
    expect(extractRunInternalError("string")).toBeNull();
    expect(extractRunInternalError(null)).toBeNull();
    expect(extractRunInternalError(undefined)).toBeNull();
  });

  it("returns null for 4xx errors (activation / validation errors go through the banner)", () => {
    const body = JSON.stringify({ error: "Workflow cannot be activated.", errors: ["scope missing"] });
    expect(extractRunInternalError(new CodemationApiHttpError(400, body))).toBeNull();
    expect(extractRunInternalError(new CodemationApiHttpError(401, ""))).toBeNull();
    expect(extractRunInternalError(new CodemationApiHttpError(404, ""))).toBeNull();
  });

  it("falls back to the raw body text when the 500 body is not valid JSON", () => {
    const result = extractRunInternalError(new CodemationApiHttpError(500, "<html>nginx</html>"));
    expect(result).not.toBeNull();
    expect(result?.message).toBe("<html>nginx</html>");
  });

  it("falls back to the CodemationApiHttpError.message when the body is empty", () => {
    const result = extractRunInternalError(new CodemationApiHttpError(500, ""));
    expect(result).not.toBeNull();
    expect(result?.message.length).toBeGreaterThan(0);
  });
});
