import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

import { resetNextNavigationTestDouble } from "./nextNavigationStub";

afterEach(() => {
  resetNextNavigationTestDouble();
});

class FrontendTestResizeObserver {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

class FrontendTestEnvironment {
  static install(): void {
    if (typeof window === "undefined" || typeof HTMLElement === "undefined") {
      return;
    }
    this.installLocalStorage();
    this.installResizeObserver();
    this.installMatchMedia();
    this.installLayoutMetrics();
    this.installScrollIntoView();
    this.installAnimationFrame();
  }

  /**
   * Node 22+ ships an experimental built-in `localStorage` that JSDOM's window inherits
   * but lacks the Storage API methods (`getItem` / `setItem` / `clear` / etc.).
   * Reinstall a minimal in-memory Storage so UI components reading panel widths work.
   */
  private static installLocalStorage(): void {
    const requiredMethods = ["getItem", "setItem", "removeItem", "clear", "key"] as const;
    const existing = (globalThis as Readonly<{ localStorage?: unknown }>).localStorage;
    const isHealthy =
      existing !== null &&
      typeof existing === "object" &&
      requiredMethods.every((method) => typeof (existing as Record<string, unknown>)[method] === "function");
    if (isHealthy) {
      return;
    }
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
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: false,
      value: storage,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: false,
      value: storage,
    });
  }

  private static installResizeObserver(): void {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: FrontendTestResizeObserver,
    });
  }

  private static installMatchMedia(): void {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value(query: string): MediaQueryList {
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener(): void {},
          removeListener(): void {},
          addEventListener(): void {},
          removeEventListener(): void {},
          dispatchEvent(): boolean {
            return false;
          },
        };
      },
    });
  }

  private static installLayoutMetrics(): void {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(): number {
        return 1280;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(): number {
        return 720;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(): number {
        return 1280;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(): number {
        return 720;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value(): DOMRect {
        return DOMRect.fromRect({ x: 0, y: 0, width: 1280, height: 720 });
      },
    });
  }

  private static installScrollIntoView(): void {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value(): void {},
    });
  }

  private static installAnimationFrame(): void {
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value(callback: FrameRequestCallback): number {
        return window.setTimeout(() => callback(performance.now()), 16);
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      writable: true,
      value(handle: number): void {
        window.clearTimeout(handle);
      },
    });
  }
}

FrontendTestEnvironment.install();
