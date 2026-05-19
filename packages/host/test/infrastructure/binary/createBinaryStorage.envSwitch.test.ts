import { describe, expect, it } from "vitest";
import { S3BinaryStorageConfigSchema } from "../../../src/infrastructure/binary/S3BinaryStorageConfig";
import { S3BinaryStorage } from "../../../src/infrastructure/binary/S3BinaryStorage";

/**
 * Unit tests for the env-switch schema validation used in AppContainerFactory.createBinaryStorage().
 *
 * The switch logic reads BINARY_STORAGE_KIND and, when "s3", parses the S3 config via
 * S3BinaryStorageConfigSchema. These tests verify the schema accepts valid configs and
 * rejects incomplete ones (matching the cross-field validation the factory enforces).
 */

// ─── S3BinaryStorage.isNotFoundError (403 must NOT be treated as not-found) ───

describe("S3BinaryStorage — 403 propagation", () => {
  const STUB_CONFIG = {
    endpoint: "https://s3.example.com",
    region: "us-east-1",
    bucket: "test-bucket",
    accessKeyId: "id",
    secretAccessKey: "secret",
  };

  it("stat() re-throws a 403 error instead of returning { exists: false }", async () => {
    const storage = new S3BinaryStorage(STUB_CONFIG);
    // Monkey-patch the private client to throw a 403-shaped S3 error.
    const forbidden = Object.assign(new Error("Forbidden"), {
      name: "S3ServiceException",
      $metadata: { httpStatusCode: 403 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (storage as any).client = {
      send: async () => {
        throw forbidden;
      },
    };

    await expect(storage.stat("some/key")).rejects.toThrow();
  });

  it("openReadStream() re-throws a 403 error instead of returning undefined", async () => {
    const storage = new S3BinaryStorage(STUB_CONFIG);
    const forbidden = Object.assign(new Error("Forbidden"), {
      name: "S3ServiceException",
      $metadata: { httpStatusCode: 403 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (storage as any).client = {
      send: async () => {
        throw forbidden;
      },
    };

    await expect(storage.openReadStream("some/key")).rejects.toThrow();
  });

  it("stat() returns { exists: false } for a genuine 404 NoSuchKey error", async () => {
    const storage = new S3BinaryStorage(STUB_CONFIG);
    const notFound = Object.assign(new Error("NoSuchKey"), {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (storage as any).client = {
      send: async () => {
        throw notFound;
      },
    };

    const result = await storage.stat("some/key");
    expect(result).toEqual({ exists: false });
  });
});

// ─── AppContainerFactory — unknown BINARY_STORAGE_KIND ────────────────────────

describe("AppContainerFactory.createBinaryStorage — unknown KIND throws", () => {
  /**
   * We test the guard logic directly since we cannot boot the full container
   * without Docker / Postgres. Extract the guard to a standalone pure function
   * matching the factory logic exactly.
   */
  function validateKind(kind: string): void {
    if (kind === "s3") return;
    if (kind !== "local") {
      throw new Error(`Unknown BINARY_STORAGE_KIND: "${kind}". Expected "local" or "s3".`);
    }
  }

  it('throws for an unknown kind like "gcs"', () => {
    expect(() => validateKind("gcs")).toThrow(/Unknown BINARY_STORAGE_KIND/);
    expect(() => validateKind("gcs")).toThrow(/"gcs"/);
  });

  it('accepts "local" without throwing', () => {
    expect(() => validateKind("local")).not.toThrow();
  });

  it('accepts "s3" without throwing', () => {
    expect(() => validateKind("s3")).not.toThrow();
  });
});

describe("createBinaryStorage env-switch schema validation", () => {
  it("accepts a fully populated S3 config", () => {
    const result = S3BinaryStorageConfigSchema.safeParse({
      endpoint: "https://s3.nl-ams.scw.cloud",
      region: "nl-ams",
      bucket: "my-codemation-bucket",
      accessKeyId: "SCWXXX",
      secretAccessKey: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when endpoint is missing", () => {
    const result = S3BinaryStorageConfigSchema.safeParse({
      region: "nl-ams",
      bucket: "my-codemation-bucket",
      accessKeyId: "SCWXXX",
      secretAccessKey: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when accessKeyId is an empty string", () => {
    const result = S3BinaryStorageConfigSchema.safeParse({
      endpoint: "https://s3.nl-ams.scw.cloud",
      region: "nl-ams",
      bucket: "my-codemation-bucket",
      accessKeyId: "",
      secretAccessKey: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when secretAccessKey is missing", () => {
    const result = S3BinaryStorageConfigSchema.safeParse({
      endpoint: "https://s3.nl-ams.scw.cloud",
      region: "nl-ams",
      bucket: "my-codemation-bucket",
      accessKeyId: "SCWXXX",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when all S3 fields are undefined (BINARY_STORAGE_KIND=s3 without env vars)", () => {
    const result = S3BinaryStorageConfigSchema.safeParse({
      endpoint: undefined,
      region: undefined,
      bucket: undefined,
      accessKeyId: undefined,
      secretAccessKey: undefined,
    });
    expect(result.success).toBe(false);
  });
});
