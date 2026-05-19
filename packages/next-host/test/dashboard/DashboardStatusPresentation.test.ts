import assert from "node:assert/strict";
import { test } from "vitest";

import { DashboardStatusPresentation } from "../../src/features/dashboard/lib/DashboardStatusPresentation";

test("colorForStatus returns green for completed", () => {
  assert.equal(DashboardStatusPresentation.colorForStatus("completed"), DashboardStatusPresentation.completedColor);
});

test("colorForStatus returns red for failed", () => {
  assert.equal(DashboardStatusPresentation.colorForStatus("failed"), DashboardStatusPresentation.failedColor);
});

test("colorForStatus returns blue for running", () => {
  assert.equal(DashboardStatusPresentation.colorForStatus("running"), DashboardStatusPresentation.runningColor);
});

test("labelForStatus returns Completed", () => {
  assert.equal(DashboardStatusPresentation.labelForStatus("completed"), "Completed");
});

test("labelForStatus returns Failed", () => {
  assert.equal(DashboardStatusPresentation.labelForStatus("failed"), "Failed");
});

test("labelForStatus returns Running", () => {
  assert.equal(DashboardStatusPresentation.labelForStatus("running"), "Running");
});

test("labelForOrigin returns Manual for manual", () => {
  assert.equal(DashboardStatusPresentation.labelForOrigin("manual"), "Manual");
});

test("labelForOrigin returns Triggered for triggered", () => {
  assert.equal(DashboardStatusPresentation.labelForOrigin("triggered"), "Triggered");
});
