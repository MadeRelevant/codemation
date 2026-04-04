import { describe, expect, it } from "vitest";

import { SecureRequestDetector } from "../../src/infrastructure/auth/SecureRequestDetector";

describe("SecureRequestDetector", () => {
  const detector = new SecureRequestDetector();

  it("treats https: request URLs as secure", () => {
    expect(detector.isSecureRequest(new Request("https://app.example/api"))).toBe(true);
  });

  it("treats http: request URLs as insecure when no forwarded proto override exists", () => {
    expect(detector.isSecureRequest(new Request("http://127.0.0.1/api"))).toBe(false);
  });

  it("treats TLS-terminated requests as secure when x-forwarded-proto is https", () => {
    expect(
      detector.isSecureRequest(
        new Request("http://127.0.0.1/api", {
          headers: { "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe(true);
  });

  it("honors the first forwarded proto value when multiple are present", () => {
    expect(
      detector.isSecureRequest(
        new Request("http://127.0.0.1/api", {
          headers: { "x-forwarded-proto": "https, http" },
        }),
      ),
    ).toBe(true);
  });
});
