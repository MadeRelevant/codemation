"use client";

import type { CollectionFieldDto } from "@codemation/host/dto";
import { Button } from "@codemation/ui";
import { Input, Switch, Textarea } from "@codemation/ui";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
  zodResolver,
} from "@/components/forms";
import { CollectionRowFormSchemaFactory } from "./CollectionRowFormSchemaFactory";

type CollectionRowFormProps = Readonly<{
  fields: ReadonlyArray<CollectionFieldDto>;
  defaultValues?: Readonly<Record<string, unknown>>;
  onSubmit: (data: Readonly<Record<string, unknown>>) => void | Promise<void>;
  submitLabel?: string;
  isSubmitting?: boolean;
}>;

export function CollectionRowForm({
  fields,
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  isSubmitting = false,
}: CollectionRowFormProps) {
  const schema = CollectionRowFormSchemaFactory.create(fields);
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {},
  });

  const handleSubmit = form.handleSubmit((values) => {
    void onSubmit(values);
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map((field) => (
          <FormField
            key={field.name}
            control={form.control}
            name={field.name}
            render={({ field: rhfField }) => (
              <FormItem>
                <FormLabel>
                  {field.name}
                  {!field.nullable && <span className="ml-1 text-destructive">*</span>}
                </FormLabel>
                <FormControl>{renderFieldInput(field, rhfField)}</FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <Button type="submit" disabled={isSubmitting} data-testid="collection-row-form-submit">
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}

function renderFieldInput(
  fieldDef: CollectionFieldDto,
  rhfField: Readonly<{
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
    name: string;
  }>,
): React.ReactElement {
  const fieldType = fieldDef.type;

  if (fieldType === "bool") {
    return (
      <Switch
        checked={Boolean(rhfField.value)}
        onCheckedChange={(checked) => rhfField.onChange(checked)}
        data-testid={`collection-field-${fieldDef.name}`}
      />
    );
  }

  if (fieldType === "jsonb") {
    return (
      <Textarea
        value={rhfField.value !== undefined ? JSON.stringify(rhfField.value, null, 2) : ""}
        onChange={(e) => {
          try {
            rhfField.onChange(JSON.parse(e.target.value));
          } catch {
            rhfField.onChange(e.target.value);
          }
        }}
        onBlur={rhfField.onBlur}
        data-testid={`collection-field-${fieldDef.name}`}
        rows={4}
      />
    );
  }

  if (fieldType === "int" || fieldType === "bigint" || fieldType === "double") {
    return (
      <Input
        type="number"
        value={rhfField.value !== undefined && rhfField.value !== null ? String(rhfField.value) : ""}
        onChange={(e) => rhfField.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        onBlur={rhfField.onBlur}
        data-testid={`collection-field-${fieldDef.name}`}
      />
    );
  }

  if (fieldType === "timestamptz") {
    const dateVal =
      rhfField.value instanceof Date ? rhfField.value : rhfField.value ? new Date(rhfField.value as string) : null;
    const formatted = dateVal && !isNaN(dateVal.getTime()) ? dateVal.toISOString().slice(0, 16) : "";
    return (
      <Input
        type="datetime-local"
        value={formatted}
        onChange={(e) => rhfField.onChange(e.target.value ? new Date(e.target.value) : undefined)}
        onBlur={rhfField.onBlur}
        data-testid={`collection-field-${fieldDef.name}`}
      />
    );
  }

  // Default: text / uuid
  return (
    <Input
      type="text"
      value={typeof rhfField.value === "string" ? rhfField.value : ""}
      onChange={(e) => rhfField.onChange(e.target.value)}
      onBlur={rhfField.onBlur}
      data-testid={`collection-field-${fieldDef.name}`}
    />
  );
}
