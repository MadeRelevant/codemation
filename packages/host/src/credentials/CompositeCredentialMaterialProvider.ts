import { inject, injectable } from "@codemation/core";
import type {
  CallerContext,
  CredentialMaterialProvider,
  CredentialMaterialRef,
  MaterialBundle,
} from "@codemation/core";
import { ManagedCredentialMaterialWriteError } from "@codemation/core";

import { LocalCredentialMaterialProvider } from "./LocalCredentialMaterialProvider";
import { ControlPlaneCredentialMaterialProvider } from "./ControlPlaneCredentialMaterialProvider";

/**
 * Routes `getMaterial` / `setMaterial` to the right inner provider based on
 * `ref.source`. Registered as the inner of `CachingCredentialMaterialProvider`
 * in managed mode so workspaces with mixed local + control-plane credential
 * instances read each through the correct provider.
 *
 * Writes against `source: "control-plane"` always throw
 * `ManagedCredentialMaterialWriteError` — managed credential bytes are owned
 * by the control plane.
 *
 * See `planning/sprints/credentials-vault/02-controlplane-material-provider.md`.
 */
@injectable()
export class CompositeCredentialMaterialProvider implements CredentialMaterialProvider {
  constructor(
    @inject(LocalCredentialMaterialProvider) private readonly local: LocalCredentialMaterialProvider,
    @inject(ControlPlaneCredentialMaterialProvider)
    private readonly controlPlane: ControlPlaneCredentialMaterialProvider,
  ) {}

  async getMaterial(ref: CredentialMaterialRef, context: CallerContext): Promise<MaterialBundle> {
    return this.pick(ref).getMaterial(ref, context);
  }

  async setMaterial(ref: CredentialMaterialRef, material: MaterialBundle): Promise<void> {
    if (ref.source === "control-plane") {
      throw new ManagedCredentialMaterialWriteError();
    }
    return this.pick(ref).setMaterial(ref, material);
  }

  private pick(ref: CredentialMaterialRef): CredentialMaterialProvider {
    return ref.source === "control-plane" ? this.controlPlane : this.local;
  }
}
