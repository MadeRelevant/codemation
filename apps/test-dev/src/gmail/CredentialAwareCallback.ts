import type { CredentialRequirement } from "@codemation/core";

import { Callback, type CallbackHandler } from "@codemation/core-nodes";

export class CredentialAwareCallback<TInputJson = unknown, TOutputJson = unknown> extends Callback<TInputJson, TOutputJson> {
  constructor(
    name: string,
    private readonly credentialRequirements: ReadonlyArray<CredentialRequirement>,
    callback: CallbackHandler<TInputJson, TOutputJson>,
    id?: string,
  ) {
    super(name, callback, id);
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return this.credentialRequirements;
  }
}
