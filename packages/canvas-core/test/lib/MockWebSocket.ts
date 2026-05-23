/**
 * MockWebSocket — synchronous WebSocket fake for unit tests.
 *
 * Usage:
 *   // Swap in before rendering:
 *   const saved = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
 *   Object.defineProperty(globalThis, "WebSocket", { value: MockWebSocket, configurable: true, writable: true });
 *
 *   // After test:
 *   if (saved) Object.defineProperty(globalThis, "WebSocket", saved);
 *   else delete (globalThis as Record<string, unknown>).WebSocket;
 *
 *   MockWebSocket.clearInstances();
 *
 * The mock is synchronous — all dispatchXxx() calls invoke handlers inline.
 * This makes it predictable without needing fake timers for connection events.
 */

type EventListenerMap = {
  open: Array<(ev: Event) => void>;
  message: Array<(ev: MessageEvent) => void>;
  error: Array<(ev: Event) => void>;
  close: Array<(ev: CloseEvent) => void>;
};

export class MockWebSocket {
  // Static mirror of real WebSocket ready-state constants.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  // Instance mirrors (for code that checks `ws.OPEN` rather than `WebSocket.OPEN`).
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  /** All instances created since the last clearInstances() call, in order. */
  static readonly instances: MockWebSocket[] = [];

  static clearInstances(): void {
    MockWebSocket.instances.splice(0);
  }

  /** Convenience: first instance whose URL matches. */
  static forUrl(urlFragment: string): MockWebSocket | undefined {
    return MockWebSocket.instances.find((s) => s.url.includes(urlFragment));
  }

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;

  /** Captured `send()` calls, each as the raw string payload. */
  readonly sentMessages: string[] = [];

  /** True once close() has been called on this instance. */
  isClosed = false;

  private readonly listeners: EventListenerMap = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: "open", listener: (ev: Event) => void): void;
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
  addEventListener(type: "error", listener: (ev: Event) => void): void;
  addEventListener(type: "close", listener: (ev: CloseEvent) => void): void;
  addEventListener(type: string, listener: (ev: unknown) => void): void {
    if (type in this.listeners) {
      (this.listeners[type as keyof EventListenerMap] as Array<(ev: unknown) => void>).push(listener);
    }
  }

  removeEventListener(type: string, listener: (ev: unknown) => void): void {
    if (type in this.listeners) {
      const list = this.listeners[type as keyof EventListenerMap] as Array<(ev: unknown) => void>;
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.isClosed) return;
    this.isClosed = true;
    if (this.readyState === MockWebSocket.OPEN || this.readyState === MockWebSocket.CONNECTING) {
      this.readyState = MockWebSocket.CLOSING;
      this.dispatchClose(code ?? 1000, reason ?? "", true);
    }
  }

  // --- Dispatch helpers ---

  /** Simulate the socket opening. Sets readyState to OPEN first. */
  dispatchOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    const ev = new Event("open");
    for (const listener of [...this.listeners.open]) {
      listener(ev);
    }
  }

  /** Simulate an incoming message. */
  dispatchMessage(data: string): void {
    const ev = new MessageEvent("message", { data });
    for (const listener of [...this.listeners.message]) {
      listener(ev);
    }
  }

  /** Simulate a transport error. */
  dispatchError(): void {
    const ev = new Event("error");
    for (const listener of [...this.listeners.error]) {
      listener(ev);
    }
  }

  /** Simulate a close event. */
  dispatchClose(code = 1000, reason = "", wasClean = code === 1000): void {
    this.readyState = MockWebSocket.CLOSED;
    const ev = new CloseEvent("close", { code, reason, wasClean });
    for (const listener of [...this.listeners.close]) {
      listener(ev);
    }
  }

  /** Parsed contents of the last message sent, or undefined. */
  lastSentJson<T = unknown>(): T | undefined {
    const last = this.sentMessages[this.sentMessages.length - 1];
    if (last === undefined) return undefined;
    return JSON.parse(last) as T;
  }

  /** All sent messages parsed as JSON. */
  allSentJson<T = unknown>(): T[] {
    return this.sentMessages.map((s) => JSON.parse(s) as T);
  }
}
