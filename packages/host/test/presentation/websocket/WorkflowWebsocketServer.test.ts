// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { ApiPaths } from "../../../src/presentation/http/ApiPaths";
import { WorkflowWebsocketServer } from "../../../src/presentation/websocket/WorkflowWebsocketServer";
import type { WebsocketAuthenticator } from "../../../src/presentation/websocket/WebsocketAuthenticator.types";
import type { VerifiedManagedPrincipal } from "@codemation/managed-auth";
import type { Logger } from "../../../src/application/logging/Logger";

// ---- test helpers -------------------------------------------------------

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function makeServer(authenticator: WebsocketAuthenticator | null = null): WorkflowWebsocketServer {
  // port 0 → OS assigns an ephemeral port
  return new WorkflowWebsocketServer(0, "127.0.0.1", silentLogger, authenticator);
}

function connect(port: number, token?: string): WebSocket {
  const query = token !== undefined ? `?token=${token}` : "";
  return new WebSocket(`ws://127.0.0.1:${String(port)}${ApiPaths.workflowWebsocket()}${query}`);
}

async function openSocket(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

async function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once("close", (code, reasonBuf) => {
      resolve({ code, reason: reasonBuf.toString("utf8") });
    });
  });
}

/**
 * Collects messages from the socket into a buffer. The returned function waits
 * until at least one message has arrived.
 */
function collectMessages(socket: WebSocket): () => Promise<unknown> {
  const buffer: unknown[] = [];
  let resolve: (() => void) | null = null;

  socket.on("message", (data) => {
    try {
      buffer.push(JSON.parse(data.toString("utf8")));
    } catch {
      // ignore parse errors in tests
    }
    resolve?.();
    resolve = null;
  });

  return () =>
    new Promise<unknown>((res, rej) => {
      if (buffer.length > 0) {
        res(buffer[0]);
        return;
      }
      resolve = () => res(buffer[0]);
      socket.once("error", rej);
    });
}

const fakePrincipal: VerifiedManagedPrincipal = { userId: "user_1", workspaceId: "ws_1" };

// ---- tests --------------------------------------------------------------

describe("WorkflowWebsocketServer — unauthenticated (self-hosted) mode", () => {
  let server: WorkflowWebsocketServer;
  let socket: WebSocket;

  beforeEach(async () => {
    server = makeServer(null);
    await server.start();
  });

  afterEach(async () => {
    socket?.terminate();
    await server.stop();
  });

  it("accepts connections without any token and sends ready", async () => {
    socket = connect(server.listeningPort);
    const waitForFirstMessage = collectMessages(socket);
    await openSocket(socket);
    const message = await waitForFirstMessage();
    expect(message).toStrictEqual({ kind: "ready" });
  });
});

describe("WorkflowWebsocketServer — managed mode (with authenticator)", () => {
  let server: WorkflowWebsocketServer;
  let socket: WebSocket;

  const makeAuthenticator = (respondWith: VerifiedManagedPrincipal | null): WebsocketAuthenticator => ({
    async authenticate(_url) {
      return respondWith;
    },
  });

  afterEach(async () => {
    socket?.terminate();
    if (server) {
      await server.stop();
    }
  });

  it("accepts a connection when the authenticator returns a principal and sends ready", async () => {
    server = makeServer(makeAuthenticator(fakePrincipal));
    await server.start();

    socket = connect(server.listeningPort, "valid-token");
    const waitForFirstMessage = collectMessages(socket);
    await openSocket(socket);
    const message = await waitForFirstMessage();
    expect(message).toStrictEqual({ kind: "ready" });
  });

  it("closes with 4401 when the token is missing (authenticator returns null)", async () => {
    // Authenticator that rejects when no token is present in URL
    const tokenCheckingAuthenticator: WebsocketAuthenticator = {
      async authenticate(url) {
        const parsed = url ? new URL(url, "http://placeholder") : null;
        const token = parsed?.searchParams.get("token");
        return token ? fakePrincipal : null;
      },
    };
    server = makeServer(tokenCheckingAuthenticator);
    await server.start();

    // Connect without a ?token= param
    socket = connect(server.listeningPort); // no token arg
    await openSocket(socket);
    const closeEvent = await waitForClose(socket);
    expect(closeEvent.code).toBe(4401);
    expect(closeEvent.reason).toBe("unauthorized");
  });

  it("closes with 4401 when the authenticator rejects the token (wrong audience)", async () => {
    server = makeServer(makeAuthenticator(null));
    await server.start();

    socket = connect(server.listeningPort, "wrong-aud-token");
    await openSocket(socket);
    const closeEvent = await waitForClose(socket);
    expect(closeEvent.code).toBe(4401);
    expect(closeEvent.reason).toBe("unauthorized");
  });

  it("closes with 4401 when the authenticator rejects the token (expired)", async () => {
    server = makeServer(makeAuthenticator(null));
    await server.start();

    socket = connect(server.listeningPort, "expired-token");
    await openSocket(socket);
    const closeEvent = await waitForClose(socket);
    expect(closeEvent.code).toBe(4401);
    expect(closeEvent.reason).toBe("unauthorized");
  });

  it("closes with 4401 when the token is an empty string", async () => {
    server = makeServer(makeAuthenticator(null));
    await server.start();

    socket = connect(server.listeningPort, "");
    await openSocket(socket);
    const closeEvent = await waitForClose(socket);
    expect(closeEvent.code).toBe(4401);
  });

  it("passes the request URL to the authenticator", async () => {
    const capturedUrls: Array<string | undefined> = [];
    const capturingAuthenticator: WebsocketAuthenticator = {
      async authenticate(url) {
        capturedUrls.push(url);
        return fakePrincipal;
      },
    };
    server = makeServer(capturingAuthenticator);
    await server.start();

    socket = connect(server.listeningPort, "my-token");
    const waitForFirstMessage = collectMessages(socket);
    await openSocket(socket);
    await waitForFirstMessage(); // wait for ready

    expect(capturedUrls).toHaveLength(1);
    expect(capturedUrls[0]).toContain("token=my-token");
  });
});

describe("ManagedWebsocketAuthenticator — token extraction", () => {
  it("extracts token from query string", async () => {
    // Test the authenticator class's URL parsing in isolation
    const { ManagedWebsocketAuthenticator } =
      await import("../../../src/presentation/websocket/ManagedWebsocketAuthenticator");

    const capturedTokens: string[] = [];
    const fakeVerifier = {
      async verify(token: string) {
        capturedTokens.push(token);
        return fakePrincipal;
      },
    };

    const authenticator = new ManagedWebsocketAuthenticator(fakeVerifier as never);
    const result = await authenticator.authenticate("/__codemation/internal/ws?token=abc.def.ghi");

    expect(result).toStrictEqual(fakePrincipal);
    expect(capturedTokens).toEqual(["abc.def.ghi"]);
  });

  it("returns null when no token query param is present", async () => {
    const { ManagedWebsocketAuthenticator } =
      await import("../../../src/presentation/websocket/ManagedWebsocketAuthenticator");

    const fakeVerifier = {
      async verify() {
        return fakePrincipal;
      },
    };

    const authenticator = new ManagedWebsocketAuthenticator(fakeVerifier as never);
    const result = await authenticator.authenticate("/__codemation/internal/ws");

    expect(result).toBeNull();
  });

  it("returns null when requestUrl is undefined", async () => {
    const { ManagedWebsocketAuthenticator } =
      await import("../../../src/presentation/websocket/ManagedWebsocketAuthenticator");

    const fakeVerifier = {
      async verify() {
        return fakePrincipal;
      },
    };

    const authenticator = new ManagedWebsocketAuthenticator(fakeVerifier as never);
    const result = await authenticator.authenticate(undefined);

    expect(result).toBeNull();
  });
});
