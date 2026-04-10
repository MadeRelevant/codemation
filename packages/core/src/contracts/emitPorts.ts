import type { Items, JsonNonArray, OutputPortKey } from "./workflowTypes";

const EMIT_PORTS_BRAND = Symbol.for("codemation.emitPorts");

export type PortsEmission = Readonly<{
  readonly [EMIT_PORTS_BRAND]: true;
  readonly ports: Readonly<Partial<Record<OutputPortKey, Items | ReadonlyArray<JsonNonArray>>>>;
}>;

export function emitPorts(
  ports: Readonly<Partial<Record<OutputPortKey, Items | ReadonlyArray<JsonNonArray>>>>,
): PortsEmission {
  return { [EMIT_PORTS_BRAND]: true, ports };
}

export function isPortsEmission(value: unknown): value is PortsEmission {
  return (
    typeof value === "object" &&
    value !== null &&
    EMIT_PORTS_BRAND in value &&
    (value as Record<symbol, unknown>)[EMIT_PORTS_BRAND] === true
  );
}

export function isUnbrandedPortsEmissionShape(value: unknown): value is Readonly<{ ports: unknown }> {
  return typeof value === "object" && value !== null && "ports" in value && !isPortsEmission(value);
}
