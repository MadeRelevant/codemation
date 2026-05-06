/**
 * Unit tests for src/excel/paths.ts — pure URL-building helpers.
 */
import { describe, expect, it } from "vitest";
import {
  workbookPath,
  worksheetPath,
  worksheetsCollectionPath,
  rangePath,
  usedRangePath,
  rangeFormatPath,
  rangeBorderPath,
  columnNumberToLetter,
} from "../../src/excel/paths";
import type { WorkbookHandle } from "../../src/excel/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandle(overrides: Partial<WorkbookHandle> = {}): WorkbookHandle {
  return {
    driveId: "driveA",
    itemId: "itemB",
    sessionId: "SESSION-123",
    expiresAt: 0,
    cookies: [],
    persistChanges: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// workbookPath
// ---------------------------------------------------------------------------

describe("workbookPath", () => {
  it("returns the canonical workbook path", () => {
    const handle = makeHandle({ driveId: "driveA", itemId: "itemB" });
    expect(workbookPath(handle)).toBe("/drives/driveA/items/itemB/workbook");
  });

  it("URL-encodes driveId and itemId", () => {
    const handle = makeHandle({ driveId: "drive/A", itemId: "item B" });
    expect(workbookPath(handle)).toBe("/drives/drive%2FA/items/item%20B/workbook");
  });
});

// ---------------------------------------------------------------------------
// worksheetsCollectionPath
// ---------------------------------------------------------------------------

describe("worksheetsCollectionPath", () => {
  it("returns the worksheets collection path", () => {
    const handle = makeHandle();
    expect(worksheetsCollectionPath(handle)).toBe("/drives/driveA/items/itemB/workbook/worksheets");
  });
});

// ---------------------------------------------------------------------------
// worksheetPath
// ---------------------------------------------------------------------------

describe("worksheetPath", () => {
  it("returns path for a simple sheet name", () => {
    const handle = makeHandle();
    expect(worksheetPath(handle, "Sheet1")).toBe("/drives/driveA/items/itemB/workbook/worksheets('Sheet1')");
  });

  it("URL-encodes sheet names with spaces", () => {
    const handle = makeHandle();
    expect(worksheetPath(handle, "My Sheet")).toBe("/drives/driveA/items/itemB/workbook/worksheets('My%20Sheet')");
  });

  it("URL-encodes sheet names with apostrophes", () => {
    const handle = makeHandle();
    // encodeURIComponent("Chef's Table") = "Chef's%20Table" (apostrophe not encoded)
    const result = worksheetPath(handle, "Chef's Table");
    expect(result).toContain("Chef");
    expect(result).toContain("%20Table");
    expect(result).toContain("/worksheets(");
  });
});

// ---------------------------------------------------------------------------
// rangePath
// ---------------------------------------------------------------------------

describe("rangePath", () => {
  it("returns path for a simple range address", () => {
    const handle = makeHandle();
    expect(rangePath(handle, "Sheet1", "A1:B10")).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/range(address='A1:B10')",
    );
  });

  it("handles single-cell addresses", () => {
    const handle = makeHandle();
    expect(rangePath(handle, "Sheet1", "C5")).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/range(address='C5')",
    );
  });
});

// ---------------------------------------------------------------------------
// usedRangePath
// ---------------------------------------------------------------------------

describe("usedRangePath", () => {
  it("returns usedRange(valuesOnly=true) by default", () => {
    const handle = makeHandle();
    expect(usedRangePath(handle, "Sheet1")).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/usedRange(valuesOnly=true)",
    );
  });

  it("returns usedRange(valuesOnly=true) when valuesOnly=true", () => {
    const handle = makeHandle();
    expect(usedRangePath(handle, "Sheet1", true)).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/usedRange(valuesOnly=true)",
    );
  });

  it("returns bare usedRange when valuesOnly=false", () => {
    const handle = makeHandle();
    expect(usedRangePath(handle, "Sheet1", false)).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/usedRange",
    );
  });
});

// ---------------------------------------------------------------------------
// rangeFormatPath
// ---------------------------------------------------------------------------

describe("rangeFormatPath", () => {
  it("returns path for the format sub-resource of a range", () => {
    const handle = makeHandle();
    expect(rangeFormatPath(handle, "Sheet1", "A1:B10")).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/range(address='A1:B10')/format",
    );
  });
});

// ---------------------------------------------------------------------------
// rangeBorderPath
// ---------------------------------------------------------------------------

describe("rangeBorderPath", () => {
  it("returns path for a specific border edge", () => {
    const handle = makeHandle();
    expect(rangeBorderPath(handle, "Sheet1", "A1:B10", "EdgeTop")).toBe(
      "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/range(address='A1:B10')/format/borders/EdgeTop",
    );
  });
});

// ---------------------------------------------------------------------------
// columnNumberToLetter
// ---------------------------------------------------------------------------

describe("columnNumberToLetter", () => {
  it("converts single-letter columns correctly", () => {
    expect(columnNumberToLetter(1)).toBe("A");
    expect(columnNumberToLetter(26)).toBe("Z");
  });

  it("converts two-letter columns correctly", () => {
    expect(columnNumberToLetter(27)).toBe("AA");
    expect(columnNumberToLetter(52)).toBe("AZ");
    expect(columnNumberToLetter(53)).toBe("BA");
  });

  it("converts three-letter columns", () => {
    expect(columnNumberToLetter(703)).toBe("AAA");
  });

  it("handles column 28 (AB)", () => {
    expect(columnNumberToLetter(28)).toBe("AB");
  });
});
