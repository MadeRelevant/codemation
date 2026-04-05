import { describe, expect, it } from "vitest";
import { SchedulerPersistenceCompatibilityValidator } from "../../src/infrastructure/persistence/SchedulerPersistenceCompatibilityValidator";

describe("SchedulerPersistenceCompatibilityValidator", () => {
  const validator = new SchedulerPersistenceCompatibilityValidator();

  it("throws when BullMQ is combined with SQLite persistence", () => {
    expect(() =>
      validator.validate({
        schedulerKind: "bullmq",
        persistence: { kind: "sqlite", databaseFilePath: "/tmp/codemation.sqlite" },
      }),
    ).toThrow(/BullMQ requires a shared PostgreSQL database/);
  });

  it("throws when BullMQ is combined with no database persistence", () => {
    expect(() =>
      validator.validate({
        schedulerKind: "bullmq",
        persistence: { kind: "none" },
      }),
    ).toThrow(/BullMQ requires PostgreSQL persistence/);
  });

  it("allows BullMQ with TCP PostgreSQL", () => {
    expect(() =>
      validator.validate({
        schedulerKind: "bullmq",
        persistence: { kind: "postgresql", databaseUrl: "postgresql://localhost:5432/db" },
      }),
    ).not.toThrow();
  });

  it("allows local scheduler with SQLite", () => {
    expect(() =>
      validator.validate({
        schedulerKind: "local",
        persistence: { kind: "sqlite", databaseFilePath: "/tmp/codemation.sqlite" },
      }),
    ).not.toThrow();
  });
});
