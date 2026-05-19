// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useLocalNavigation } from "../../src/screens/useLocalNavigation";

describe("useLocalNavigation", () => {
  it("initial urlLocation has expected shape", () => {
    const { result } = renderHook(() => useLocalNavigation());
    expect(result.current.urlLocation).toEqual({
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
  });

  it("navigateToLocation updates urlLocation", () => {
    const { result } = renderHook(() => useLocalNavigation());
    act(() => {
      result.current.navigateToLocation({ selectedRunId: "run-1", isRunsPaneVisible: true, nodeId: "n1" });
    });
    expect(result.current.urlLocation).toEqual({
      selectedRunId: "run-1",
      isRunsPaneVisible: true,
      nodeId: "n1",
    });
  });

  it("navigateToLocation is a stable reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useLocalNavigation());
    const firstRef = result.current.navigateToLocation;
    rerender();
    expect(result.current.navigateToLocation).toBe(firstRef);
  });

  it("multiple location updates are applied sequentially", () => {
    const { result } = renderHook(() => useLocalNavigation());
    act(() => {
      result.current.navigateToLocation({ selectedRunId: "run-A", isRunsPaneVisible: false, nodeId: null });
    });
    act(() => {
      result.current.navigateToLocation({ selectedRunId: "run-B", isRunsPaneVisible: true, nodeId: "n2" });
    });
    expect(result.current.urlLocation.selectedRunId).toBe("run-B");
    expect(result.current.urlLocation.isRunsPaneVisible).toBe(true);
  });
});
