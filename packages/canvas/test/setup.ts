import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

/**
 * Node 22+ ships an experimental built-in `localStorage` that JSDOM's window inherits
 * but lacks the Storage API methods (getItem / setItem / etc.).
 * Canvas hooks (useLastRunTrigger, NodePropertiesSlidePanel) call localStorage directly.
 * Install a minimal in-memory Storage so full-mount tests don't crash.
 */
function installLocalStoragePolyfill(): void {
  if (typeof window === "undefined") return;
  const required = ["getItem", "setItem", "removeItem", "clear", "key"] as const;
  const existing = (globalThis as Readonly<{ localStorage?: unknown }>).localStorage;
  const healthy =
    existing !== null &&
    typeof existing === "object" &&
    required.every((m) => typeof (existing as Record<string, unknown>)[m] === "function");
  if (healthy) return;
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? (store.get(k) ?? null) : null;
    },
    key(i: number) {
      return [...store.keys()][i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, writable: false, value: storage });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: false, value: storage });
}

installLocalStoragePolyfill();

/**
 * ResizeObserver is used by ReactFlow (and @radix-ui/react-use-size) which are
 * rendered by full-mount canvas tests. Install a no-op stub.
 */
function installResizeObserverPolyfill(): void {
  if (typeof window === "undefined") return;
  if (typeof window.ResizeObserver !== "undefined") return;
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, "ResizeObserver", { configurable: true, writable: true, value: ResizeObserverStub });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}

installResizeObserverPolyfill();
