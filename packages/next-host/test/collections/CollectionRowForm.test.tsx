// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installCollectionsJsdomPolyfills } from "./collectionsJsdomPolyfills";

installCollectionsJsdomPolyfills();

import type { CollectionFieldDto } from "@codemation/host/dto";
import { CollectionRowFormSchemaFactory } from "../../src/features/collections/components/CollectionRowFormSchemaFactory";
import { CollectionRowForm } from "../../src/features/collections/components/CollectionRowForm";

function makeField(overrides: Partial<CollectionFieldDto> = {}): CollectionFieldDto {
  return {
    name: "test_field",
    type: "text",
    nullable: false,
    hasDefault: false,
    ...overrides,
  };
}

describe("CollectionRowFormSchemaFactory", () => {
  it("maps text type to z.string()", () => {
    const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "email", type: "text" })]);
    expect(schema.safeParse({ email: "hello" }).success).toBe(true);
    expect(schema.safeParse({ email: 123 }).success).toBe(false);
  });

  it("maps int type to z.coerce.number().int()", () => {
    const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "count", type: "int" })]);
    expect(schema.safeParse({ count: 5 }).success).toBe(true);
    expect(schema.safeParse({ count: "5" }).success).toBe(true); // coerced
    expect(schema.safeParse({ count: 5.5 }).success).toBe(false);
  });

  it("maps bool type to z.coerce.boolean()", () => {
    const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "active", type: "bool" })]);
    expect(schema.safeParse({ active: true }).success).toBe(true);
    expect(schema.safeParse({ active: false }).success).toBe(true);
  });

  it("makes nullable fields optional", () => {
    const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "note", type: "text", nullable: true })]);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ note: "hi" }).success).toBe(true);
  });

  it("requires non-nullable fields", () => {
    const schema = CollectionRowFormSchemaFactory.create([makeField({ name: "name", type: "text", nullable: false })]);
    // missing required field — string type requires string input, undefined fails
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("CollectionRowForm", () => {
  it("renders text field as text input", () => {
    render(<CollectionRowForm fields={[makeField({ name: "sender_email", type: "text" })]} onSubmit={() => {}} />);
    const input = screen.getByTestId("collection-field-sender_email");
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).type).toBe("text");
  });

  it("renders bool field as switch", () => {
    render(<CollectionRowForm fields={[makeField({ name: "active", type: "bool" })]} onSubmit={() => {}} />);
    const switchEl = screen.getByTestId("collection-field-active");
    expect(switchEl).toBeTruthy();
    expect(switchEl.getAttribute("role")).toBe("switch");
  });

  it("renders number field as number input", () => {
    render(<CollectionRowForm fields={[makeField({ name: "count", type: "int" })]} onSubmit={() => {}} />);
    const input = screen.getByTestId("collection-field-count");
    expect((input as HTMLInputElement).type).toBe("number");
  });

  it("renders submit button with custom label", () => {
    render(
      <CollectionRowForm fields={[makeField({ name: "x", type: "text" })]} onSubmit={() => {}} submitLabel="Insert" />,
    );
    expect(screen.getByTestId("collection-row-form-submit").textContent).toBe("Insert");
  });
});
