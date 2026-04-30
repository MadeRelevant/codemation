import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

class FrontendTestEnvironment {
  static install(): void {
    if (typeof window === "undefined" || typeof HTMLElement === "undefined") return;
    this.installLocalStorage();
  }

  /**
   * Node 22+ ships an experimental built-in `localStorage` that JSDOM's window inherits but lacks the
   * Storage API methods (`getItem` / `setItem` / `clear` / etc.). Reinstall a minimal in-memory Storage
   * so UI components and tests that read/write `window.localStorage` keep working.
   */
  private static installLocalStorage(): void {
    const requiredMethods = ["getItem", "setItem", "removeItem", "clear", "key"] as const;
    const existing = (globalThis as Readonly<{ localStorage?: unknown }>).localStorage;
    const isHealthy =
      existing !== null &&
      typeof existing === "object" &&
      requiredMethods.every((method) => typeof (existing as Record<string, unknown>)[method] === "function");
    if (isHealthy) return;
    const store = new Map<string, string>();
    const storage: Storage = {
      get length(): number {
        return store.size;
      },
      clear(): void {
        store.clear();
      },
      getItem(key: string): string | null {
        return store.has(key) ? (store.get(key) ?? null) : null;
      },
      key(index: number): string | null {
        return [...store.keys()][index] ?? null;
      },
      removeItem(key: string): void {
        store.delete(key);
      },
      setItem(key: string, value: string): void {
        store.set(key, String(value));
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, writable: false, value: storage });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: false, value: storage });
  }
}

FrontendTestEnvironment.install();
