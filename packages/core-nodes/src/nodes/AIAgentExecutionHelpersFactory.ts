import type { CredentialSessionService, ZodSchemaAny } from "@codemation/core";
import { injectable } from "@codemation/core";

import { toJSONSchema as frameworkToJSONSchema } from "zod/v4/core";

import { ConnectionCredentialExecutionContextFactory } from "./ConnectionCredentialExecutionContextFactory";

/**
 * Shape of the instance-level `toJSONSchema` method that Zod v4 schemas expose. Conversions must go
 * through this instance method (see {@link AIAgentExecutionHelpersFactory#createJsonSchemaRecord})
 * rather than the module-level `toJSONSchema` import because the consumer's workflow-loader (see
 * `CodemationConsumerConfigLoader.toNamespace`) can load Zod under a separate tsx namespace. That
 * produces two runtime copies of Zod whose internal class / symbol identities don't overlap, so the
 * framework-side module-level `toJSONSchema` throws "Cannot read properties of undefined (reading
 * 'def')" on consumer-created schemas. The instance method is bound inside the schema's own module
 * and therefore uses the matching Zod internals.
 */
type ZodInstanceToJsonSchema = (params?: Readonly<{ target: "draft-07" | "draft-7" | "draft-2020-12" }>) => unknown;

/**
 * Helper utilities shared by {@link AIAgentNode} and supporting runners.
 *
 * Responsibilities:
 * - {@link #createConnectionCredentialExecutionContextFactory} centralizes credential-context wiring.
 * - {@link #createJsonSchemaRecord} is a pure Zod → draft-07 converter used by both
 *   `OpenAiStrictJsonSchemaFactory` (to feed OpenAI-strict structured output) and the
 *   `AgentStructuredOutputRepairPromptFactory` (to show a required-schema reminder).
 */
@injectable()
export class AIAgentExecutionHelpersFactory {
  createConnectionCredentialExecutionContextFactory(
    credentialSessions: CredentialSessionService,
  ): ConnectionCredentialExecutionContextFactory {
    return new ConnectionCredentialExecutionContextFactory(credentialSessions);
  }

  /**
   * Produces a plain JSON Schema object (`draft-07`) from a Zod schema, as needed by
   * OpenAI tool-parameter schemas and the structured-output repair prompt.
   * - Prefers the schema's **instance** `toJSONSchema(...)` method so we stay inside the Zod
   *   instance that created the schema (works across consumer/framework tsx namespaces — see
   *   {@link ZodInstanceToJsonSchema}). Falls back to the framework-imported module function.
   * - Strips root `$schema` (OpenAI ignores it).
   * - Sanitizes `required` for cfworker json-schema compatibility (must be a string array or absent).
   */
  createJsonSchemaRecord(
    inputSchema: ZodSchemaAny,
    options: Readonly<{
      schemaName: string;
      requireObjectRoot: boolean;
    }>,
  ): Record<string, unknown> {
    const draft07Params = { target: "draft-07" as const };
    const converted = this.convertZodSchemaToJsonSchema(inputSchema, draft07Params);
    const record = converted as Record<string, unknown>;
    const { $schema: _draftSchemaOmitted, ...rest } = record;
    if (options.requireObjectRoot && rest.type !== "object") {
      throw new Error(
        `Cannot create tool "${options.schemaName}": tool input schema must be a JSON Schema object type (got type=${String(rest.type)}).`,
      );
    }
    if (
      options.requireObjectRoot &&
      rest.properties !== undefined &&
      (typeof rest.properties !== "object" || Array.isArray(rest.properties))
    ) {
      throw new Error(
        `Cannot create tool "${options.schemaName}": tool input schema "properties" must be an object (got ${JSON.stringify(rest.properties)}).`,
      );
    }
    if (options.requireObjectRoot && rest.properties === undefined) {
      rest.properties = {};
    }
    this.sanitizeJsonSchemaRequiredKeywordsForCfworker(rest);
    return rest;
  }

  /**
   * Runs Zod's `toJSONSchema` via the schema's own instance method when available, so consumer
   * schemas loaded under a different tsx namespace still convert correctly. If the caller handed us
   * a payload that lacks that method (e.g. a plain JSON Schema record or a Zod instance whose
   * prototype was stripped), we fall back to the framework-bundled module function.
   */
  private convertZodSchemaToJsonSchema(inputSchema: ZodSchemaAny, params: Readonly<{ target: "draft-07" }>): unknown {
    const candidate = (inputSchema as unknown as { toJSONSchema?: ZodInstanceToJsonSchema }).toJSONSchema;
    if (typeof candidate === "function") {
      return candidate.call(inputSchema, params);
    }
    return frameworkToJSONSchema(inputSchema as unknown as Parameters<typeof frameworkToJSONSchema>[0], params);
  }

  /**
   * `@cfworker/json-schema` iterates `schema.required` with `for...of`; it must be a string array or absent.
   */
  private sanitizeJsonSchemaRequiredKeywordsForCfworker(node: unknown): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return;
    }
    const o = node as Record<string, unknown>;
    const req = o.required;
    if (req !== undefined && !Array.isArray(req)) {
      delete o.required;
    } else if (Array.isArray(req)) {
      const strings = req.filter((x): x is string => typeof x === "string");
      if (strings.length === 0) {
        delete o.required;
      } else if (strings.length !== req.length) {
        o.required = strings;
      }
    }
    const props = o.properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      for (const v of Object.values(props)) {
        this.sanitizeJsonSchemaRequiredKeywordsForCfworker(v);
      }
    }
    for (const key of ["allOf", "anyOf", "oneOf"] as const) {
      const branch = o[key];
      if (Array.isArray(branch)) {
        for (const sub of branch) {
          this.sanitizeJsonSchemaRequiredKeywordsForCfworker(sub);
        }
      }
    }
    if (o.if) this.sanitizeJsonSchemaRequiredKeywordsForCfworker(o.if);
    if (o.then) this.sanitizeJsonSchemaRequiredKeywordsForCfworker(o.then);
    if (o.else) this.sanitizeJsonSchemaRequiredKeywordsForCfworker(o.else);
    if (o.not) this.sanitizeJsonSchemaRequiredKeywordsForCfworker(o.not);
    if (o.items) this.sanitizeJsonSchemaRequiredKeywordsForCfworker(o.items);
    if (Array.isArray(o.prefixItems)) {
      for (const sub of o.prefixItems) {
        this.sanitizeJsonSchemaRequiredKeywordsForCfworker(sub);
      }
    }
  }
}
