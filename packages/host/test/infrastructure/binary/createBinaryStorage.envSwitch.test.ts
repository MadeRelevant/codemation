import { describe, expect, it } from "vitest";
import { S3BinaryStorageConfigSchema } from "../../../src/infrastructure/binary/S3BinaryStorageConfig";

/**
 * Unit tests for the env-switch schema validation used in AppContainerFactory.createBinaryStorage().
 *
 * The switch logic reads BINARY_STORAGE_KIND and, when "s3", parses the S3 config via
 * S3BinaryStorageConfigSchema. These tests verify the schema accepts valid configs and
 * rejects incomplete ones (matching the cross-field validation the factory enforces).
 */
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
