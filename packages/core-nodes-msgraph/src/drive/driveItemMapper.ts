/**
 * Shared mappers for raw Graph driveItem responses.
 *
 * These are kept separate from driveResolveNode.ts so B2–B5 nodes can import
 * them without touching B1's output shape (DriveResolveOutput includes `isShared`
 * which is not meaningful for list/get/download/upload output).
 */

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/**
 * Compact child-item shape produced by DriveListChildrenNode.
 * Intentionally minimal — callers that need more fields should use DriveItemGetNode.
 */
export type DriveChildItem = {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  mimeType?: string;
  size?: number;
  isFolder: boolean;
  lastModifiedDateTime?: string;
};

/**
 * Full driveItem shape produced by DriveItemGetNode (and reused for upload output).
 * Expanded sub-objects (permissions, listItem, thumbnails) are typed as `unknown`
 * because their schemas vary and consumers drill in via their own types.
 */
export type DriveItemFull = {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  mimeType?: string;
  size?: number;
  isFolder: boolean;
  lastModifiedDateTime?: string;
  parentReference?: unknown;
  permissions?: unknown;
  listItem?: unknown;
  thumbnails?: unknown;
};

// ---------------------------------------------------------------------------
// Raw Graph shapes
// ---------------------------------------------------------------------------

export type RawChildItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: Record<string, unknown>;
  parentReference?: { driveId?: string };
  permissions?: unknown;
  listItem?: unknown;
  thumbnails?: unknown;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Map a raw Graph driveItem response to the DriveChildItem shape.
 * `fallbackDriveId` is used when `parentReference.driveId` is absent in the response.
 */
export function toCanonicalChild(item: RawChildItem, fallbackDriveId: string): DriveChildItem {
  return {
    driveId: item.parentReference?.driveId ?? fallbackDriveId,
    itemId: item.id ?? "",
    name: item.name ?? "",
    webUrl: item.webUrl ?? "",
    mimeType: item.file?.mimeType,
    size: item.size,
    isFolder: Boolean(item.folder),
    lastModifiedDateTime: item.lastModifiedDateTime,
  };
}

/**
 * Map a raw Graph driveItem response to the full DriveItemFull shape.
 * Expanded sub-objects are passed through opaquely.
 */
export function toCanonicalFull(item: RawChildItem, fallbackDriveId: string): DriveItemFull {
  return {
    driveId: item.parentReference?.driveId ?? fallbackDriveId,
    itemId: item.id ?? "",
    name: item.name ?? "",
    webUrl: item.webUrl ?? "",
    mimeType: item.file?.mimeType,
    size: item.size,
    isFolder: Boolean(item.folder),
    lastModifiedDateTime: item.lastModifiedDateTime,
    parentReference: item.parentReference,
    permissions: item.permissions,
    listItem: item.listItem,
    thumbnails: item.thumbnails,
  };
}
