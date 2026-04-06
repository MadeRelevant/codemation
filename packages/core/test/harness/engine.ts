import { RegistrarEngineTestKitFactory } from "../../src/testing/RegistrarEngineTestKitFactory.ts";
import type {
  EngineTestKitOptions as EngineTestKitOptionsBase,
  RegistrarEngineTestKitOptions as RegistrarEngineTestKitOptionsBase,
} from "../../src/testing/RegistrarEngineTestKit.types.ts";

export { CapturingScheduler } from "../../src/testing/CapturingScheduler.ts";
export type { RegistrarEngineTestKitHandle } from "../../src/testing/RegistrarEngineTestKit.types.ts";

export type EngineTestKitOptions = EngineTestKitOptionsBase;
export type RegistrarEngineTestKitOptions = RegistrarEngineTestKitOptionsBase;

export function createEngineTestKit(options: EngineTestKitOptions = {}) {
  return createRegistrarEngineTestKit(options);
}

/**
 * Same ports as {@link createEngineTestKit}, but wires the engine through {@link EngineRuntimeRegistrar}
 * so {@link RunIntentService} and {@link CoreTokens.WorkflowRunnerService} resolve like production host tests.
 */
export function createRegistrarEngineTestKit(options: RegistrarEngineTestKitOptions = {}) {
  return RegistrarEngineTestKitFactory.create(options);
}
