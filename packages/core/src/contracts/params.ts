import type { ItemExpr } from "./itemExpr";

export type Expr<T, TItemJson = unknown> = ItemExpr<T, TItemJson>;

export type Param<T, TItemJson = unknown> = T | Expr<T, TItemJson>;

export type ParamDeep<T, TItemJson = unknown> =
  | Expr<T, TItemJson>
  | (T extends readonly (infer U)[] ? ReadonlyArray<ParamDeep<U, TItemJson>> : never)
  | (T extends object ? { [K in keyof T]: ParamDeep<T[K], TItemJson> } : T);
