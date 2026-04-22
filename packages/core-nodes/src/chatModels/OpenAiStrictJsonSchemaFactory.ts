import type { ZodSchemaAny } from "@codemation/core";
import { inject, injectable } from "@codemation/core";

import { AIAgentExecutionHelpersFactory } from "../nodes/AIAgentExecutionHelpersFactory";

/**
 * Produces an OpenAI **strict mode**–compliant JSON Schema for an AIAgent `outputSchema`.
 *
 * Why this exists: AI SDK's default Zod → JSON Schema conversion (Zod v4's `toJSONSchema`) can
 * emit `unevaluatedProperties: false` or skip `additionalProperties: false` on object branches.
 * OpenAI's strict-mode validator rejects anything missing `additionalProperties: false` at
 * `context=()` (the root) and requires **all properties** in `required`. We convert here so all
 * legal Zod root shapes work (object, union, discriminated union, nullable-object wrapper, array,
 * intersection, …) and hand AI SDK a pre-tagged `jsonSchema(...)` record that passes straight
 * through to the provider.
 *
 * Rules enforced on the produced JSON Schema record:
 * - Every `type: "object"` node (root and nested under `allOf`/`anyOf`/`oneOf`/`items`/`prefixItems`/`$defs`):
 *   - `additionalProperties: false`
 *   - `required` lists **every** key in `properties` (OpenAI strict requires all properties required;
 *     express optionality via `.nullable()` / `z.union([..., z.null()])`).
 *   - `properties` is always an object (empty object allowed).
 * - `$schema`, `unevaluatedProperties`, and `default` are stripped (OpenAI rejects / ignores them).
 * - `sanitizeJsonSchemaRequiredKeywordsForCfworker` invariants from
 *   {@link AIAgentExecutionHelpersFactory.createJsonSchemaRecord} are preserved as a starting point.
 */
@injectable()
export class OpenAiStrictJsonSchemaFactory {
  constructor(
    @inject(AIAgentExecutionHelpersFactory)
    private readonly executionHelpers: AIAgentExecutionHelpersFactory,
  ) {}

  createStructuredOutputRecord(
    schema: ZodSchemaAny,
    options: Readonly<{ schemaName: string; title?: string }>,
  ): Record<string, unknown> {
    const record = this.executionHelpers.createJsonSchemaRecord(schema, {
      schemaName: options.schemaName,
      requireObjectRoot: false,
    });
    this.strictifyRecursive(record);
    if (options.title !== undefined) {
      record.title = options.title;
    }
    return record;
  }

  private strictifyRecursive(node: unknown): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    const o = node as Record<string, unknown>;
    this.stripOpenAiRejectedKeywords(o);
    if (this.isObjectNode(o)) {
      const props = this.readPropertiesObject(o);
      o.properties = props;
      o.additionalProperties = false;
      o.required = Object.keys(props);
      for (const value of Object.values(props)) {
        this.strictifyRecursive(value);
      }
    }
    this.recurseIntoComposites(o);
  }

  private stripOpenAiRejectedKeywords(o: Record<string, unknown>): void {
    delete o["$schema"];
    delete o["unevaluatedProperties"];
    delete o["default"];
  }

  private isObjectNode(o: Record<string, unknown>): boolean {
    const typeIsObject =
      o.type === "object" || (Array.isArray(o.type) && (o.type as ReadonlyArray<unknown>).includes("object"));
    const hasObjectProperties =
      o.properties !== undefined && typeof o.properties === "object" && !Array.isArray(o.properties);
    return typeIsObject || hasObjectProperties;
  }

  private readPropertiesObject(o: Record<string, unknown>): Record<string, unknown> {
    if (o.properties && typeof o.properties === "object" && !Array.isArray(o.properties)) {
      return o.properties as Record<string, unknown>;
    }
    return {};
  }

  private recurseIntoComposites(o: Record<string, unknown>): void {
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"] as const) {
      const branch = o[key];
      if (Array.isArray(branch)) {
        for (const sub of branch) {
          this.strictifyRecursive(sub);
        }
      }
    }
    if (o.not) {
      this.strictifyRecursive(o.not);
    }
    if (o.items) {
      if (Array.isArray(o.items)) {
        for (const sub of o.items) {
          this.strictifyRecursive(sub);
        }
      } else {
        this.strictifyRecursive(o.items);
      }
    }
    for (const key of ["if", "then", "else"] as const) {
      if (o[key]) {
        this.strictifyRecursive(o[key]);
      }
    }
    for (const key of ["$defs", "definitions"] as const) {
      const defs = o[key];
      if (defs && typeof defs === "object" && !Array.isArray(defs)) {
        for (const sub of Object.values(defs as Record<string, unknown>)) {
          this.strictifyRecursive(sub);
        }
      }
    }
  }
}
