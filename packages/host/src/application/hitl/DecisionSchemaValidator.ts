import Ajv from "ajv/dist/2020.js";
import { injectable } from "@codemation/core";
import type { JsonValue } from "@codemation/core";

// Zod v4's z.toJSONSchema() emits draft 2020-12, so we must use Ajv's 2020 build.
const ajv = new Ajv({ strict: false });

/**
 * Validates a HITL decision payload against the JSON Schema that was recorded
 * when the human task was created.
 */
@injectable()
export class DecisionSchemaValidator {
  validate(args: { schemaJson: string; value: JsonValue }): { valid: true } | { valid: false; message: string } {
    const schema = JSON.parse(args.schemaJson) as object;
    const fn = ajv.compile(schema);
    if (fn(args.value)) {
      return { valid: true };
    }
    return { valid: false, message: ajv.errorsText(fn.errors) };
  }
}
