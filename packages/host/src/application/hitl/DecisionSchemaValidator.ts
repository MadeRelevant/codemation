import Ajv from "ajv";
import { injectable } from "@codemation/core";
import type { JsonValue } from "@codemation/core";

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
