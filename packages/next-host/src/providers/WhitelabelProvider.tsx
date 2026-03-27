"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CodemationWhitelabelSnapshot } from "../whitelabel/CodemationWhitelabelSnapshot";

const defaultSnapshot: CodemationWhitelabelSnapshot = {
  productName: "Codemation",
  logoUrl: null,
};

const WhitelabelContext = createContext<CodemationWhitelabelSnapshot>(defaultSnapshot);

export function WhitelabelProvider(
  args: Readonly<{ children: ReactNode; value: CodemationWhitelabelSnapshot }>,
): ReactNode {
  return <WhitelabelContext.Provider value={args.value}>{args.children}</WhitelabelContext.Provider>;
}

export function useWhitelabel(): CodemationWhitelabelSnapshot {
  return useContext(WhitelabelContext);
}
