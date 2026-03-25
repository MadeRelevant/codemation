import { expect, test } from "vitest";

import { CliDatabaseUrlDescriptor } from "../src/user/CliDatabaseUrlDescriptor";

test("describes postgres URL with host, port, and database name (no credentials)", () => {
  const d = new CliDatabaseUrlDescriptor();
  expect(d.describeForDisplay("postgresql://user:secret@localhost:5432/myapp")).toBe(
    'database "myapp" on localhost:5432',
  );
});

test("uses default postgres port when omitted", () => {
  const d = new CliDatabaseUrlDescriptor();
  expect(d.describeForDisplay("postgresql://localhost/myapp")).toBe('database "myapp" on localhost:5432');
});

test("handles undefined and empty", () => {
  const d = new CliDatabaseUrlDescriptor();
  expect(d.describeForDisplay(undefined)).toBe("unknown database target");
  expect(d.describeForDisplay("")).toBe("unknown database target");
});
