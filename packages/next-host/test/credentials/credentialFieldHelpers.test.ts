import { describe, expect, it } from "vitest";

import {
  buildEmptySecretFieldValues,
  buildFieldStringValues,
  isCredentialFieldLockedByEnv,
  maskedDisplayValue,
} from "../../src/features/credentials/lib/credentialFieldHelpers";

describe("credentialFieldHelpers", () => {
  describe("maskedDisplayValue", () => {
    it("returns the masked string", () => {
      expect(maskedDisplayValue()).toBe("••••••••••••");
    });
  });

  describe("buildEmptySecretFieldValues", () => {
    it("returns an empty record for no fields", () => {
      expect(buildEmptySecretFieldValues([])).toEqual({});
    });

    it("returns empty strings for all field keys", () => {
      const fields = [
        { key: "api_key", label: "API Key", kind: "secret" as const, required: true },
        { key: "secret_token", label: "Token", kind: "secret" as const, required: false },
      ];
      expect(buildEmptySecretFieldValues(fields)).toEqual({ api_key: "", secret_token: "" });
    });
  });

  describe("buildFieldStringValues", () => {
    it("converts source values to strings", () => {
      const fields = [
        { key: "host", label: "Host", kind: "text" as const, required: true },
        { key: "port", label: "Port", kind: "text" as const, required: true },
      ];
      expect(buildFieldStringValues(fields, { host: "localhost", port: 5432 })).toEqual({
        host: "localhost",
        port: "5432",
      });
    });

    it("fills in empty string for missing source keys", () => {
      const fields = [{ key: "host", label: "Host", kind: "text" as const, required: true }];
      expect(buildFieldStringValues(fields, {})).toEqual({ host: "" });
      expect(buildFieldStringValues(fields, undefined)).toEqual({ host: "" });
    });

    it("converts null/undefined values to empty string via nullish coalescing", () => {
      const fields = [{ key: "key", label: "Key", kind: "text" as const, required: false }];
      // null ?? "" = "" → String("") = ""
      expect(buildFieldStringValues(fields, { key: null })).toEqual({ key: "" });
    });
  });

  describe("isCredentialFieldLockedByEnv", () => {
    it("returns false when envVarName is not set", () => {
      const field = { key: "api_key", label: "API Key", kind: "secret" as const, required: true };
      expect(isCredentialFieldLockedByEnv(field, { MY_KEY: true })).toBe(false);
    });

    it("returns false when env var is not present in status", () => {
      const field = {
        key: "api_key",
        label: "API Key",
        kind: "secret" as const,
        required: true,
        envVarName: "MY_API_KEY",
      };
      expect(isCredentialFieldLockedByEnv(field, {})).toBe(false);
    });

    it("returns true when env var is set in status", () => {
      const field = {
        key: "api_key",
        label: "API Key",
        kind: "secret" as const,
        required: true,
        envVarName: "MY_API_KEY",
      };
      expect(isCredentialFieldLockedByEnv(field, { MY_API_KEY: true })).toBe(true);
    });

    it("returns false when env var status is false", () => {
      const field = {
        key: "api_key",
        label: "API Key",
        kind: "secret" as const,
        required: true,
        envVarName: "MY_API_KEY",
      };
      expect(isCredentialFieldLockedByEnv(field, { MY_API_KEY: false })).toBe(false);
    });

    it("returns false when envVarName is whitespace-only", () => {
      const field = { key: "api_key", label: "API Key", kind: "secret" as const, required: true, envVarName: "   " };
      expect(isCredentialFieldLockedByEnv(field, {})).toBe(false);
    });
  });
});
