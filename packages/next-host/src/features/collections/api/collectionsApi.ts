"use client";

import { ApiPaths } from "@codemation/host/client";
import type {
  CollectionDetailDto,
  CollectionRowDto,
  CollectionSummaryDto,
  ListCollectionRowsResponseDto,
  SyncCollectionsResponseDto,
} from "@codemation/host/dto";
import { codemationApiClient } from "../../../api/CodemationApiClient";

export async function listCollections(): Promise<ReadonlyArray<CollectionSummaryDto>> {
  return codemationApiClient.getJson<ReadonlyArray<CollectionSummaryDto>>(ApiPaths.collections());
}

export async function getCollection(name: string): Promise<CollectionDetailDto | null> {
  try {
    return await codemationApiClient.getJson<CollectionDetailDto>(ApiPaths.collection(name));
  } catch {
    return null;
  }
}

export async function listCollectionRows(
  name: string,
  params: Readonly<{ limit?: number; offset?: number; where?: Readonly<Record<string, string>> }> = {},
): Promise<ListCollectionRowsResponseDto> {
  const url = new URL(ApiPaths.collectionRows(name), "http://localhost");
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) url.searchParams.set("offset", String(params.offset));
  if (params.where) {
    for (const [key, value] of Object.entries(params.where)) {
      url.searchParams.set(`where[${key}]`, value);
    }
  }
  const path = url.pathname + url.search;
  return codemationApiClient.getJson<ListCollectionRowsResponseDto>(path);
}

export async function getCollectionRow(name: string, id: string): Promise<CollectionRowDto | null> {
  try {
    return await codemationApiClient.getJson<CollectionRowDto>(ApiPaths.collectionRow(name, id));
  } catch {
    return null;
  }
}

export async function insertCollectionRow(
  name: string,
  data: Readonly<Record<string, unknown>>,
): Promise<CollectionRowDto> {
  return codemationApiClient.postJson<CollectionRowDto>(ApiPaths.collectionRows(name), data);
}

export async function updateCollectionRow(
  name: string,
  id: string,
  patch: Readonly<Record<string, unknown>>,
): Promise<CollectionRowDto> {
  return codemationApiClient.patchJson<CollectionRowDto>(ApiPaths.collectionRow(name, id), patch);
}

export async function deleteCollectionRow(name: string, id: string): Promise<void> {
  return codemationApiClient.delete(ApiPaths.collectionRow(name, id));
}

export async function syncCollections(dryRun = false): Promise<SyncCollectionsResponseDto> {
  const url = dryRun ? `${ApiPaths.syncCollections()}?dryRun=1` : ApiPaths.syncCollections();
  return codemationApiClient.postJson<SyncCollectionsResponseDto>(url);
}
