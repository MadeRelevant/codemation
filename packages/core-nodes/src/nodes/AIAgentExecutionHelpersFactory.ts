import type { CredentialSessionService, Item, Items, NodeExecutionContext, ZodSchemaAny } from "@codemation/core";
import { injectable } from "@codemation/core";

import { isInteropZodSchema } from "@langchain/core/utils/types";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { toJSONSchema } from "zod/v4/core";

import { ConnectionCredentialExecutionContextFactory } from "./ConnectionCredentialExecutionContextFactory";
import type { ResolvedTool } from "./aiAgentSupport.types";

/**
 * LangChain adapters and credential context wiring for {@link AIAgentNode}.
 * Lives in a `*Factory.ts` composition-root module so construction stays explicit and testable.
 */
@injectable()
export class AIAgentExecutionHelpersFactory {
  createConnectionCredentialExecutionContextFactory(
    credentialSessions: CredentialSessionService,
  ): ConnectionCredentialExecutionContextFactory {
    return new ConnectionCredentialExecutionContextFactory(credentialSessions);
  }

  createDynamicStructuredTool(
    entry: ResolvedTool,
    toolCredentialContext: NodeExecutionContext<any>,
    item: Item,
    itemIndex: number,
    items: Items,
  ): DynamicStructuredTool {
    if (entry.runtime.inputSchema == null) {
      throw new Error(
        `Cannot create LangChain tool "${entry.config.name}": missing inputSchema (broken tool runtime resolution).`,
      );
    }
    const schemaForOpenAi = this.normalizeToolInputSchemaForOpenAiDynamicStructuredTool(
      entry.config.name,
      entry.runtime.inputSchema,
    );
    return new DynamicStructuredTool({
      name: entry.config.name,
      description: entry.config.description ?? entry.runtime.defaultDescription,
      schema: schemaForOpenAi as unknown as ZodSchemaAny,
      func: async (input) => {
        const result = await entry.runtime.execute({
          config: entry.config,
          input,
          ctx: toolCredentialContext,
          item,
          itemIndex,
          items,
        });
        return JSON.stringify(result);
      },
    });
  }

  /**
   * Produces a plain JSON Schema object for OpenAI tool parameters and LangChain tool invocation:
   * - **Zod** → `toJSONSchema(..., { target: "draft-07" })` so shapes match what `@cfworker/json-schema`
   *   expects (`required` must be an array; draft 2020-12 output can break validation).
   * - Otherwise LangChain `toJsonSchema` (Standard Schema + JSON passthrough); if the result is still Zod
   *   (duplicate `zod` copies), fall back to Zod `toJSONSchema` with draft-07.
   * - Strip root `$schema` for OpenAI; normalize invalid `required` keywords for cfworker; ensure `properties`.
   */
  private normalizeToolInputSchemaForOpenAiDynamicStructuredTool(
    toolName: string,
    inputSchema: ZodSchemaAny,
  ): Record<string, unknown> {
    const draft07Params = { target: "draft-07" as const };
    let converted: unknown;
    if (isInteropZodSchema(inputSchema)) {
      converted = toJSONSchema(inputSchema as unknown as Parameters<typeof toJSONSchema>[0], draft07Params);
    } else {
      converted = toJsonSchema(inputSchema);
      if (isInteropZodSchema(converted)) {
        converted = toJSONSchema(inputSchema as unknown as Parameters<typeof toJSONSchema>[0], draft07Params);
      }
    }
    const record = converted as Record<string, unknown>;
    const { $schema: _draftSchemaOmitted, ...rest } = record;
    if (rest.type !== "object") {
      throw new Error(
        `Cannot create LangChain tool "${toolName}": tool input schema must be a JSON Schema object type (got type=${String(rest.type)}).`,
      );
    }
    if (rest.properties !== undefined && (typeof rest.properties !== "object" || Array.isArray(rest.properties))) {
      throw new Error(
        `Cannot create LangChain tool "${toolName}": tool input schema "properties" must be an object (got ${JSON.stringify(rest.properties)}).`,
      );
    }
    if (rest.properties === undefined) {
      rest.properties = {};
    }
    this.sanitizeJsonSchemaRequiredKeywordsForCfworker(rest);
    return rest;
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
