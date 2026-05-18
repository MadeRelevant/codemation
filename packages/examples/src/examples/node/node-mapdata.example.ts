/**
 * @description Manual trigger → MapData rename + derive fields → MapData format for display.
 * Demonstrates MapData as the primary transformation node: applied per-item, returns the new json shape.
 * @tags transform, mapping, fields, rename, derive, convert, shape, style:node
 * @uses @codemation/core-nodes, node:MapData
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { MapData } from "@codemation/core-nodes";

type RawUser = Readonly<{
  first_name: string;
  last_name: string;
  email_address: string;
  account_balance_cents: number;
}>;

type NormalizedUser = Readonly<{
  fullName: string;
  email: string;
  balanceUsd: number;
}>;

type DisplayUser = NormalizedUser & Readonly<{ label: string }>;

export default workflow("example.node-mapdata")
  .name("MapData: rename fields + derive values")
  .manualTrigger<RawUser>("Raw user records", [
    { first_name: "Alice", last_name: "Nguyen", email_address: "alice@example.com", account_balance_cents: 4750 },
    { first_name: "Bob", last_name: "Silva", email_address: "bob@example.com", account_balance_cents: 0 },
  ])
  // MapData applies a function per item. Use it for: renaming keys, deriving fields,
  // converting units, or picking a subset of properties. Each call produces a new item shape.
  .then(
    new MapData<RawUser, NormalizedUser>("Normalize user", (item) => ({
      fullName: `${item.json.first_name} ${item.json.last_name}`,
      email: item.json.email_address,
      balanceUsd: item.json.account_balance_cents / 100,
    })),
  )
  // Chain a second MapData to add a display label without touching upstream fields.
  .then(
    new MapData<NormalizedUser, DisplayUser>("Add display label", (item) => ({
      ...item.json,
      label: `${item.json.fullName} <${item.json.email}>`,
    })),
  )
  .build();
