import type { TypeToken } from "@codemation/core";
import type { HmacNonceStore } from "./HmacNonceStore";

export const HmacNonceStoreToken = Symbol.for("codemation.pairing.HmacNonceStore") as TypeToken<HmacNonceStore>;
