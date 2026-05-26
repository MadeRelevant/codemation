import { describe, expect, it } from "vitest";
import type {
  CallerContext,
  CredentialMaterialProvider,
  CredentialMaterialRef,
  MaterialBundle,
} from "@codemation/core";
import { ManagedCredentialMaterialWriteError } from "@codemation/core";

import { CompositeCredentialMaterialProvider } from "../../src/credentials/CompositeCredentialMaterialProvider";
import type { LocalCredentialMaterialProvider } from "../../src/credentials/LocalCredentialMaterialProvider";
import type { ControlPlaneCredentialMaterialProvider } from "../../src/credentials/ControlPlaneCredentialMaterialProvider";

const callerContext: CallerContext = {
  workspaceId: "ws-1",
  caller: { kind: "manual", userId: "u-1" },
};

class FakeProvider implements CredentialMaterialProvider {
  label: string;
  getCalls: Array<{ ref: CredentialMaterialRef; ctx: CallerContext }> = [];
  setCalls: Array<{ ref: CredentialMaterialRef; material: MaterialBundle }> = [];
  result: MaterialBundle = { accessToken: "at", grantedScopes: [] };

  constructor(label: string) {
    this.label = label;
    this.result = { accessToken: `at-${label}`, grantedScopes: [] };
  }

  async getMaterial(ref: CredentialMaterialRef, ctx: CallerContext): Promise<MaterialBundle> {
    this.getCalls.push({ ref, ctx });
    return this.result;
  }

  async setMaterial(ref: CredentialMaterialRef, material: MaterialBundle): Promise<void> {
    this.setCalls.push({ ref, material });
  }
}

function makeComposite(): {
  composite: CompositeCredentialMaterialProvider;
  local: FakeProvider;
  cp: FakeProvider;
} {
  const local = new FakeProvider("local");
  const cp = new FakeProvider("cp");
  const composite = new CompositeCredentialMaterialProvider(
    local as unknown as LocalCredentialMaterialProvider,
    cp as unknown as ControlPlaneCredentialMaterialProvider,
  );
  return { composite, local, cp };
}

describe("CompositeCredentialMaterialProvider", () => {
  it("getMaterial routes local refs to the local provider", async () => {
    const { composite, local, cp } = makeComposite();
    const ref: CredentialMaterialRef = { source: "local", id: "l-1" };
    const bundle = await composite.getMaterial(ref, callerContext);
    expect(bundle.accessToken).toBe("at-local");
    expect(local.getCalls).toEqual([{ ref, ctx: callerContext }]);
    expect(cp.getCalls).toEqual([]);
  });

  it("getMaterial routes control-plane refs to the CP provider", async () => {
    const { composite, local, cp } = makeComposite();
    const ref: CredentialMaterialRef = { source: "control-plane", id: "cp-1" };
    const bundle = await composite.getMaterial(ref, callerContext);
    expect(bundle.accessToken).toBe("at-cp");
    expect(cp.getCalls).toEqual([{ ref, ctx: callerContext }]);
    expect(local.getCalls).toEqual([]);
  });

  it("setMaterial routes local refs to the local provider", async () => {
    const { composite, local } = makeComposite();
    const ref: CredentialMaterialRef = { source: "local", id: "l-1" };
    const material: MaterialBundle = { accessToken: "x", grantedScopes: ["s"] };
    await composite.setMaterial(ref, material);
    expect(local.setCalls).toEqual([{ ref, material }]);
  });

  it("setMaterial throws ManagedCredentialMaterialWriteError for control-plane refs", async () => {
    const { composite, cp } = makeComposite();
    await expect(
      composite.setMaterial({ source: "control-plane", id: "cp-1" }, { accessToken: "x", grantedScopes: [] }),
    ).rejects.toBeInstanceOf(ManagedCredentialMaterialWriteError);
    expect(cp.setCalls).toEqual([]);
  });
});
