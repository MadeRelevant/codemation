import type { CollectionFieldDto } from "@codemation/host/dto";
import { z } from "@/components/forms";

/**
 * Converts a list of {@link CollectionFieldDto} into a Zod schema for the collection row form.
 * Factory suffix → composition root → static methods allowed.
 */
export class CollectionRowFormSchemaFactory {
  static create(fields: ReadonlyArray<CollectionFieldDto>): z.ZodObject<z.ZodRawShape> {
    // zod 4 makes ZodRawShape readonly; build the shape on a mutable record then
    // hand it to z.object (which accepts the wider Readonly view).
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const field of fields) {
      shape[field.name] = CollectionRowFormSchemaFactory.fieldToZod(field);
    }
    return z.object(shape);
  }

  static fieldToZod(field: CollectionFieldDto): z.ZodTypeAny {
    let base: z.ZodTypeAny;
    switch (field.type) {
      case "text":
      case "uuid":
        base = z.string();
        break;
      case "int":
      case "bigint":
        base = z.coerce.number().int();
        break;
      case "double":
        base = z.coerce.number();
        break;
      case "bool":
        base = z.coerce.boolean();
        break;
      case "timestamptz":
        base = z.coerce.date();
        break;
      case "jsonb":
        base = z.unknown();
        break;
      default:
        base = z.string();
    }
    return field.nullable ? base.optional() : base;
  }
}
