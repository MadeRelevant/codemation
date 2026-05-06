/**
 * Pure path-building helpers for Microsoft Graph Excel Workbook API URLs.
 *
 * All returned strings start with "/" and are relative to the Graph v1.0 base
 * URL (`https://graph.microsoft.com/v1.0`).
 *
 * Sheet names are URL-encoded with `encodeURIComponent` — Graph requires this
 * because sheet names may contain spaces, apostrophes, parentheses, etc.
 */

import type { WorkbookHandle } from "./session";

// ---------------------------------------------------------------------------
// Workbook root
// ---------------------------------------------------------------------------

/**
 * Returns the workbook root path for a given drive item.
 * e.g. `/drives/{driveId}/items/{itemId}/workbook`
 */
export function workbookPath(handle: WorkbookHandle): string {
  return `/drives/${encodeURIComponent(handle.driveId)}/items/${encodeURIComponent(handle.itemId)}/workbook`;
}

// ---------------------------------------------------------------------------
// Worksheet paths
// ---------------------------------------------------------------------------

/**
 * Returns the path for a specific worksheet by name.
 * e.g. `/drives/{driveId}/items/{itemId}/workbook/worksheets('{sheetName}')`
 *
 * The sheet name is URL-encoded so spaces and apostrophes are handled correctly.
 */
export function worksheetPath(handle: WorkbookHandle, sheet: string): string {
  return `${workbookPath(handle)}/worksheets('${encodeURIComponent(sheet)}')`;
}

/**
 * Returns the path for the worksheets collection.
 * e.g. `/drives/{driveId}/items/{itemId}/workbook/worksheets`
 */
export function worksheetsCollectionPath(handle: WorkbookHandle): string {
  return `${workbookPath(handle)}/worksheets`;
}

// ---------------------------------------------------------------------------
// Range paths
// ---------------------------------------------------------------------------

/**
 * Returns the path for a specific range address on a sheet.
 * e.g. `/drives/{driveId}/items/{itemId}/workbook/worksheets('{sheet}')/range(address='A1:B10')`
 *
 * The address is NOT URL-encoded here — Graph range addresses use alphanumeric
 * characters and colon only.
 */
export function rangePath(handle: WorkbookHandle, sheet: string, address: string): string {
  return `${worksheetPath(handle, sheet)}/range(address='${address}')`;
}

/**
 * Returns the path for the "used range" of a worksheet.
 *
 * @param valuesOnly When true, returns the `usedRange(valuesOnly=true)` variant
 *   which omits formatting metadata (numberFormat, etc.) for a lighter response.
 *   When false (or omitted), returns the full `usedRange` response including
 *   formatting metadata needed for date-serial detection.
 */
export function usedRangePath(handle: WorkbookHandle, sheet: string, valuesOnly = true): string {
  const suffix = valuesOnly ? "(valuesOnly=true)" : "";
  return `${worksheetPath(handle, sheet)}/usedRange${suffix}`;
}

// ---------------------------------------------------------------------------
// Format path
// ---------------------------------------------------------------------------

/**
 * Returns the path for the `format` sub-resource of a specific range.
 * e.g. `.../range(address='A1:B10')/format`
 *
 * This is the target of the coalesced PATCH in ExcelStyleRangeNode.
 */
export function rangeFormatPath(handle: WorkbookHandle, sheet: string, address: string): string {
  return `${rangePath(handle, sheet, address)}/format`;
}

/**
 * Returns the path for a specific border edge on a range's format.
 * e.g. `.../range(address='A1:B10')/format/borders/EdgeTop`
 */
export function rangeBorderPath(handle: WorkbookHandle, sheet: string, address: string, edge: string): string {
  return `${rangeFormatPath(handle, sheet, address)}/borders/${edge}`;
}

// ---------------------------------------------------------------------------
// Column-letter helper
// ---------------------------------------------------------------------------

/**
 * Convert a 1-based column number to its Excel column letter(s).
 * Supports columns beyond Z (AA, AB, ...).
 *
 * Examples:
 *   1  → "A"
 *   26 → "Z"
 *   27 → "AA"
 *   52 → "AZ"
 */
export function columnNumberToLetter(n: number): string {
  let result = "";
  let remaining = n;
  while (remaining > 0) {
    const mod = (remaining - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}
