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
    this.installResizeObserver();
    this.installMatchMedia();
    this.installLayoutMetrics();
    this.installScrollIntoView();
    this.installAnimationFrame();
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
