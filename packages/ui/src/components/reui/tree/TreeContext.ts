import type { ItemInstance } from "@headless-tree/core";
import { createContext } from "react";

export type ToggleIconType = "chevron" | "plus-minus";

export type TreeContextValue<T = unknown> = {
  indent: number;
  currentItem?: ItemInstance<T>;
  tree?: {
    getContainerProps?: () => Record<string, unknown>;
    getDragLineStyle?: () => Record<string, unknown> | null;
  };
  toggleIconType?: ToggleIconType;
};

export const TreeContext = createContext<TreeContextValue>({
  indent: 20,
  currentItem: undefined,
  tree: undefined,
  toggleIconType: "plus-minus",
});
