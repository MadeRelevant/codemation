// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useWorkflowDetailScreenThemeStyle } from "../../src/screens/useWorkflowDetailScreenThemeStyle";
import type { WorkflowCanvasConfig } from "@codemation/canvas-core";

describe("useWorkflowDetailScreenThemeStyle", () => {
  it("returns empty object when config is undefined", () => {
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(undefined));
    expect(result.current).toEqual({});
  });

  it("returns empty object when config has no theme", () => {
    const config: WorkflowCanvasConfig = {};
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toEqual({});
  });

  it("returns empty object when theme is empty object", () => {
    const config: WorkflowCanvasConfig = { theme: {} };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toEqual({});
  });

  it("maps colorNodeBackground to --canvas-node-bg CSS variable", () => {
    const config: WorkflowCanvasConfig = { theme: { colorNodeBackground: "#fff" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-node-bg": "#fff" });
  });

  it("maps colorNodeBorder to --canvas-node-border", () => {
    const config: WorkflowCanvasConfig = { theme: { colorNodeBorder: "#333" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-node-border": "#333" });
  });

  it("maps colorNodeSelected to --canvas-node-selected", () => {
    const config: WorkflowCanvasConfig = { theme: { colorNodeSelected: "#00f" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-node-selected": "#00f" });
  });

  it("maps colorNodeRunning to --canvas-node-running", () => {
    const config: WorkflowCanvasConfig = { theme: { colorNodeRunning: "#f00" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-node-running": "#f00" });
  });

  it("maps colorNodeQueued to --canvas-node-queued", () => {
    const config: WorkflowCanvasConfig = { theme: { colorNodeQueued: "#ff0" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-node-queued": "#ff0" });
  });

  it("maps colorEdge to --canvas-edge", () => {
    const config: WorkflowCanvasConfig = { theme: { colorEdge: "#aaa" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-edge": "#aaa" });
  });

  it("maps colorEdgeLabel to --canvas-edge-label", () => {
    const config: WorkflowCanvasConfig = { theme: { colorEdgeLabel: "#bbb" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-edge-label": "#bbb" });
  });

  it("maps colorCanvasBackground to --canvas-bg", () => {
    const config: WorkflowCanvasConfig = { theme: { colorCanvasBackground: "#eee" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-bg": "#eee" });
  });

  it("maps fontFamilyLabel to --canvas-font-family-label", () => {
    const config: WorkflowCanvasConfig = { theme: { fontFamilyLabel: "Inter" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-font-family-label": "Inter" });
  });

  it("maps borderRadiusNode to --canvas-border-radius-node", () => {
    const config: WorkflowCanvasConfig = { theme: { borderRadiusNode: "8px" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({ "--canvas-border-radius-node": "8px" });
  });

  it("maps multiple theme properties together", () => {
    const config: WorkflowCanvasConfig = {
      theme: {
        colorNodeBackground: "#fff",
        colorEdge: "#888",
        borderRadiusNode: "4px",
      },
    };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    expect(result.current).toMatchObject({
      "--canvas-node-bg": "#fff",
      "--canvas-edge": "#888",
      "--canvas-border-radius-node": "4px",
    });
  });

  it("omits CSS vars for falsy/undefined theme properties", () => {
    const config: WorkflowCanvasConfig = { theme: { colorNodeBackground: "" } };
    const { result } = renderHook(() => useWorkflowDetailScreenThemeStyle(config));
    // Empty string is falsy — should not be included
    expect(result.current).not.toHaveProperty("--canvas-node-bg");
  });
});
