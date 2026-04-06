import type { TypeToken } from "../di";

export type DefinedNodeRegistrationContext = {
  registerNode<TValue>(token: TypeToken<TValue>, implementation?: TypeToken<TValue>): void;
};

export type DefinedNodeRegistration = {
  register(context: DefinedNodeRegistrationContext): void;
};
