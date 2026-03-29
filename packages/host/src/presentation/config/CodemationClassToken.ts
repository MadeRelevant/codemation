import type { TypeToken } from "@codemation/core";

export type CodemationClassToken<TValue> = TypeToken<TValue> & (new (...args: never[]) => TValue);
