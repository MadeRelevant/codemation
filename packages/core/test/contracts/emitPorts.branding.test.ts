import assert from "node:assert/strict";
import { describe, it } from "vitest";

describe("emitPorts branding", () => {
  it("stays recognizable across duplicate module loads", async () => {
    const moduleA = await import("../../src/contracts/emitPorts");
    const moduleB = await import("../../src/contracts/emitPorts?duplicate=1");

    const emitted = moduleA.emitPorts({ main: [{ json: { ok: true } }] });

    assert.equal(moduleA.isPortsEmission(emitted), true);
    assert.equal(moduleB.isPortsEmission(emitted), true);
  });

  it("is recognized by NodeOutputNormalizer across duplicate module loads", async () => {
    const emitPortsModule = await import("../../src/contracts/emitPorts");
    const emitted = emitPortsModule.emitPorts({ main: [{ json: { ok: true } }] });

    const normalizerModule = await import("../../src/execution/NodeOutputNormalizer?duplicate=1");
    const normalizer = new normalizerModule.NodeOutputNormalizer();

    const out = normalizer.normalizeExecuteResult({
      baseItem: { json: {} },
      raw: emitted,
      behavior: { keepBinaries: false },
    });

    assert.deepEqual(out, { main: [{ json: { ok: true } }] });
  });
});
