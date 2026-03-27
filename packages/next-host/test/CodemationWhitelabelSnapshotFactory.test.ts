import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationWhitelabelSnapshotFactory } from "../src/whitelabel/CodemationWhitelabelSnapshotFactory";

test("CodemationWhitelabelSnapshotFactory maps consumer whitelabel config", () => {
  const snapshot = CodemationWhitelabelSnapshotFactory.fromConsumerConfig({
    whitelabel: {
      productName: "Acme Corp",
      logoPath: "branding/logo.svg",
    },
  });
  assert.equal(snapshot.productName, "Acme Corp");
  assert.equal(snapshot.logoUrl, "/api/whitelabel/logo");
});

test("CodemationWhitelabelSnapshotFactory defaults product name when whitelabel missing", () => {
  const snapshot = CodemationWhitelabelSnapshotFactory.fromConsumerConfig({});
  assert.equal(snapshot.productName, "Codemation");
  assert.equal(snapshot.logoUrl, null);
});
