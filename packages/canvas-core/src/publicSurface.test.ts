/**
 * Guards the canvas-core public API surface.
 * Importing and asserting these exports ensures that accidental drops
 * in src/index.ts are caught immediately rather than discovered at build time.
 */
import { describe, it, expect } from "vitest";
import {
  useWorkflowDetailController,
  useWorkflowRunController,
  useWorkflowInspectController,
  useWorkflowPinController,
  useWorkflowJsonEditController,
  useWorkflowTestSuiteController,
  useWorkflowsQuery,
  createWorkflowCanvasApiClient,
  useWorkflowCanvasApiClient,
  useWorkflowCanvasConfig,
  layoutWorkflow,
  useAsyncWorkflowLayout,
  useWorkflowRealtimeBadgeState,
  RealtimeContext,
} from "./index";

describe("canvas-core public API surface", () => {
  it("exports useWorkflowDetailController as a function", () => {
    expect(typeof useWorkflowDetailController).toBe("function");
  });

  it("exports useWorkflowRunController as a function", () => {
    expect(typeof useWorkflowRunController).toBe("function");
  });

  it("exports useWorkflowInspectController as a function", () => {
    expect(typeof useWorkflowInspectController).toBe("function");
  });

  it("exports useWorkflowPinController as a function", () => {
    expect(typeof useWorkflowPinController).toBe("function");
  });

  it("exports useWorkflowJsonEditController as a function", () => {
    expect(typeof useWorkflowJsonEditController).toBe("function");
  });

  it("exports useWorkflowTestSuiteController as a function", () => {
    expect(typeof useWorkflowTestSuiteController).toBe("function");
  });

  it("exports useWorkflowsQuery as a function", () => {
    expect(typeof useWorkflowsQuery).toBe("function");
  });

  it("exports createWorkflowCanvasApiClient as a function", () => {
    expect(typeof createWorkflowCanvasApiClient).toBe("function");
  });

  it("exports useWorkflowCanvasApiClient as a function", () => {
    expect(typeof useWorkflowCanvasApiClient).toBe("function");
  });

  it("exports useWorkflowCanvasConfig as a function", () => {
    expect(typeof useWorkflowCanvasConfig).toBe("function");
  });

  it("exports layoutWorkflow as a function", () => {
    expect(typeof layoutWorkflow).toBe("function");
  });

  it("exports useAsyncWorkflowLayout as a function", () => {
    expect(typeof useAsyncWorkflowLayout).toBe("function");
  });

  it("exports useWorkflowRealtimeBadgeState as a function", () => {
    expect(typeof useWorkflowRealtimeBadgeState).toBe("function");
  });

  it("exports RealtimeContext as a React context", () => {
    expect(RealtimeContext).toBeDefined();
    expect(typeof RealtimeContext).toBe("object");
  });
});
