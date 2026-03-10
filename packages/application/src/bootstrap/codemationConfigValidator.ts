import type { CodemationConfig } from "./codemationBootstrapTypes";

export class CodemationConfigValidator {
  validate(config: CodemationConfig, env: Readonly<Record<string, string | undefined>>): void {
    this.validatePort("frontendPort", config.runtime?.frontendPort);
    this.validateConsumerModuleRoots(config.discovery?.consumerModuleRoots);
    if (config.runtime?.scheduler?.kind === "bullmq" && config.runtime.eventBus?.kind === "memory") {
      throw new Error("BullMQ scheduler requires a Redis event bus.");
    }
    if ((config.runtime?.scheduler?.kind === "bullmq" || config.runtime?.eventBus?.kind === "redis") && !(config.runtime.eventBus?.redisUrl ?? env.REDIS_URL)) {
      throw new Error("Redis-backed scheduling/event bus requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
  }

  private validatePort(field: "frontendPort", value: number | undefined): void {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid runtime.${field}: expected a positive integer`);
    }
  }

  private validateConsumerModuleRoots(value: ReadonlyArray<string> | undefined): void {
    if (!value) return;
    if (value.some((entry) => entry.trim().length === 0)) {
      throw new Error("Invalid discovery.consumerModuleRoots: expected non-empty relative paths.");
    }
  }
}
