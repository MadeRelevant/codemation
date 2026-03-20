import type { RunnableNodeConfig,TypeToken } from "@codemation/core";



import { ExampleUppercaseNode } from "./ExampleUppercaseNode";
 
export class ExampleUppercase<
  TInputJson extends Record<string, unknown> = Record<string, unknown>,
  TField extends keyof TInputJson & string = keyof TInputJson & string,
> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ExampleUppercaseNode;
  constructor(
    public readonly name: string,
    public readonly cfg: { field: TField },
    public readonly id?: string,
  ) {}
}

export { ExampleUppercaseNode } from "./ExampleUppercaseNode";
