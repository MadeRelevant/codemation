import type { TypeToken } from "@codemation/core";
import type { PairingConfig } from "./pairing.types";

// Symbol token so the DI container can inject PairingConfig.
// Registered by PairingConfigFactory in the composition root.
export const PairingConfigToken = Symbol.for("codemation.pairing.PairingConfig") as TypeToken<PairingConfig>;
