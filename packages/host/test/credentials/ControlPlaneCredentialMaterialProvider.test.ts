import { describe, expect, it } from "vitest";
import type { CallerContext, CredentialMaterialRef } from "@codemation/core";
import {
  IllegalMaterialSourceError,
  ManagedCredentialMaterialWriteError,
  ManagedMaterialFetchError,
} from "@codemation/core";

import { ControlPlaneCredentialMaterialProvider } from "../../src/credentials/ControlPlaneCredentialMaterialProvider";
import type { PairedFetch } from "../../src/pairing/PairedFetch";
import type { PairingConfig } from "../../src/pairing/pairing.types";

const callerContext: CallerContext = {
  workspaceId: "ws-1",
  caller: { kind: "manual", userId: "u-1" },
  reason: "test",
};

const cpRef: CredentialMaterialRef = { source: "control-plane", id: "cp-inst-42" };

interface PostCall {
  url: string;
  body: unknown;
}

function makeFetch(
  response: { status: number; ok: boolean; jsonBody?: unknown; textBody?: string },
  calls: PostCall[],
): PairedFetch {
  const fake = {
    async post(url: string, body: unknown): Promise<Response> {
      calls.push({ url, body });
      const res = {
        ok: response.ok,
        status: response.status,
        async json(): Promise<unknown> {
          return response.jsonBody ?? {};
        },
        async text(): Promise<string> {
          return response.textBody ?? "";
        },
      };
      return res as unknown as Response;
    },
  };
  return fake as unknown as PairedFetch;
}

function makeConfig(): PairingConfig {
  return {
    workspaceId: "ws-1",
    pairingSecret: "AAAA",
    controlPlaneUrl: "https://cp.example.test",
  } as PairingConfig;
}

describe("ControlPlaneCredentialMaterialProvider", () => {
  it("getMaterial POSTs to the CP material endpoint with callerContext and maps the response to MaterialBundle", async () => {
    const calls: PostCall[] = [];
    const fetch = makeFetch(
      {
        ok: true,
        status: 200,
        jsonBody: {
          accessToken: "at-1",
          expiresAt: "2026-05-26T13:00:00.000Z",
          scopes: ["scope-a", "scope-b"],
          providerAccountId: "user@example.com",
          typeId: "oauth.google.gmail",
        },
      },
      calls,
    );
    const provider = new ControlPlaneCredentialMaterialProvider(fetch, makeConfig());

    const bundle = await provider.getMaterial(cpRef, callerContext);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://cp.example.test/internal/credentials/material/cp-inst-42");
    expect(calls[0]?.body).toEqual({ callerContext });
    expect(bundle).toEqual({
      accessToken: "at-1",
      refreshToken: undefined,
      expiresAt: "2026-05-26T13:00:00.000Z",
      grantedScopes: ["scope-a", "scope-b"],
    });
  });

  it("getMaterial url-encodes the ref id", async () => {
    const calls: PostCall[] = [];
    const fetch = makeFetch({ ok: true, status: 200, jsonBody: { accessToken: "x", scopes: [] } }, calls);
    const provider = new ControlPlaneCredentialMaterialProvider(fetch, makeConfig());
    await provider.getMaterial({ source: "control-plane", id: "with/slash" }, callerContext);
    expect(calls[0]?.url).toBe("https://cp.example.test/internal/credentials/material/with%2Fslash");
  });

  it("getMaterial throws IllegalMaterialSourceError for local refs", async () => {
    const provider = new ControlPlaneCredentialMaterialProvider(makeFetch({ ok: true, status: 200 }, []), makeConfig());
    await expect(provider.getMaterial({ source: "local", id: "x" }, callerContext)).rejects.toBeInstanceOf(
      IllegalMaterialSourceError,
    );
  });

  for (const status of [401, 403, 404, 502]) {
    it(`getMaterial throws ManagedMaterialFetchError on HTTP ${status}`, async () => {
      const provider = new ControlPlaneCredentialMaterialProvider(
        makeFetch({ ok: false, status, textBody: `body-${status}` }, []),
        makeConfig(),
      );
      const err = await provider.getMaterial(cpRef, callerContext).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ManagedMaterialFetchError);
      expect((err as ManagedMaterialFetchError).status).toBe(status);
      expect((err as ManagedMaterialFetchError).providerErrorBody).toBe(`body-${status}`);
    });
  }

  it("getMaterial throws ManagedMaterialFetchError when accessToken is missing", async () => {
    const provider = new ControlPlaneCredentialMaterialProvider(
      makeFetch({ ok: true, status: 200, jsonBody: { scopes: [] } }, []),
      makeConfig(),
    );
    await expect(provider.getMaterial(cpRef, callerContext)).rejects.toBeInstanceOf(ManagedMaterialFetchError);
  });

  it("setMaterial throws ManagedCredentialMaterialWriteError without calling fetch", async () => {
    const calls: PostCall[] = [];
    const provider = new ControlPlaneCredentialMaterialProvider(
      makeFetch({ ok: true, status: 200 }, calls),
      makeConfig(),
    );
    await expect(provider.setMaterial(cpRef, { accessToken: "x", grantedScopes: [] })).rejects.toBeInstanceOf(
      ManagedCredentialMaterialWriteError,
    );
    expect(calls).toHaveLength(0);
  });
});
