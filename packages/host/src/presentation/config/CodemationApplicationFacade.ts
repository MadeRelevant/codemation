import type { AnyCredentialType } from "@codemation/core";

export interface CodemationApplicationFacade {
  registerCredentialType(type: AnyCredentialType): void;
}
