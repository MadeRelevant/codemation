// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Providers } from "../../src/providers/Providers";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWebSocket === undefined) {
    delete (globalThis as Partial<typeof globalThis>).WebSocket;
  } else {
    globalThis.WebSocket = originalWebSocket;
  }
});

describe("Providers", () => {
  beforeEach(() => {
    // Suppress WebSocket connection attempts from the realtime boundary
    globalThis.WebSocket = class StubWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
      readonly CONNECTING = 0;
      readonly OPEN = 1;
      readonly CLOSING = 2;
      readonly CLOSED = 3;
      readonly url: string;
      readonly protocol = "";
      readonly extensions = "";
      readonly bufferedAmount = 0;
      readonly binaryType: BinaryType = "blob";
      readyState = 0;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      constructor(url: string) {
        super();
        this.url = url;
      }
      close(): void {}
      send(): void {}
    } as unknown as typeof WebSocket;

    // Suppress any fetch calls from initialisation (e.g. react-query)
    globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });
  });

  it("mounts the provider tree and renders children in a browser environment", () => {
    render(
      <Providers>
        <div data-testid="child-content">Hello</div>
      </Providers>,
    );

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toHaveTextContent("Hello");
  });

  it("mounts with a websocket port and dehydratedState without throwing", () => {
    render(
      <Providers websocketPort="4001" dehydratedState={undefined}>
        <span data-testid="child2">World</span>
      </Providers>,
    );

    expect(screen.getByTestId("child2")).toBeInTheDocument();
  });

  it("renders children with all optional props omitted", () => {
    render(
      <Providers>
        <article data-testid="bare-child">bare</article>
      </Providers>,
    );

    expect(screen.getByTestId("bare-child")).toBeInTheDocument();
    expect(screen.getByTestId("bare-child")).toHaveTextContent("bare");
  });

  it("mounts correctly when NODE_ENV is development (staleTime=30000 branch)", () => {
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      render(
        <Providers>
          <span data-testid="dev-child">dev</span>
        </Providers>,
      );
      expect(screen.getByTestId("dev-child")).toBeInTheDocument();
    } finally {
      process.env.NODE_ENV = priorNodeEnv;
    }
  });
});
