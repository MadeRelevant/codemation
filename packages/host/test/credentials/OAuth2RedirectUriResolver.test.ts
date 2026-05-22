import { describe, expect, it } from "vitest";
import { OAuth2RedirectUriResolver } from "../../src/domain/credentials/OAuth2RedirectUriResolver";
import { makeAppConfig } from "../testkit/AppConfigFixturesFactory";

function makeResolver(publicBaseUrl?: string): OAuth2RedirectUriResolver {
  const appConfig = makeAppConfig({
    env: publicBaseUrl ? { CODEMATION_PUBLIC_BASE_URL: publicBaseUrl } : {},
  });
  return new OAuth2RedirectUriResolver(appConfig);
}

describe("OAuth2RedirectUriResolver.resolve", () => {
  it("uses requestOrigin when CODEMATION_PUBLIC_BASE_URL is not set", () => {
    const resolver = makeResolver();
    const uri = resolver.resolve("http://localhost:3000");
    expect(uri).toBe("http://localhost:3000/api/oauth2/callback");
  });

  it("rewrites 127.0.0.1 loopback to localhost", () => {
    const resolver = makeResolver("http://127.0.0.1:3000");
    const uri = resolver.resolve("http://ignored");
    expect(uri).toContain("localhost");
    expect(uri).not.toContain("127.0.0.1");
  });

  it("rewrites [::1] loopback to localhost", () => {
    const resolver = makeResolver("http://[::1]:4000");
    const uri = resolver.resolve("http://ignored");
    expect(uri).toContain("localhost");
  });

  it("uses CODEMATION_PUBLIC_BASE_URL when set", () => {
    const resolver = makeResolver("https://app.example.com");
    const uri = resolver.resolve("http://should-be-ignored");
    expect(uri).toBe("https://app.example.com/api/oauth2/callback");
  });

  it("uses first segment from comma-separated proxy forwarding list", () => {
    const resolver = makeResolver("https://primary.example.com,https://secondary.example.com");
    const uri = resolver.resolve("http://ignored");
    expect(uri).toContain("primary.example.com");
    expect(uri).not.toContain("secondary.example.com");
  });

  it("auto-prepends http:// when scheme is missing from public base URL", () => {
    const resolver = makeResolver("localhost:4000");
    const uri = resolver.resolve("http://ignored");
    expect(uri).toContain("localhost");
    expect(uri).toContain("/api/oauth2/callback");
  });

  it("throws ApplicationRequestError when base URL has an obviously invalid hostname (http as hostname)", () => {
    const resolver = makeResolver("http,http");
    expect(() => resolver.resolve("http://ignored")).toThrow(/Invalid OAuth2 public base URL/);
  });

  it("throws ApplicationRequestError for a completely invalid base URL", () => {
    const resolver = makeResolver("://bad-url");
    expect(() => resolver.resolve("http://ignored")).toThrow(/Invalid public base URL/);
  });

  it("throws when no public base URL and requestOrigin is empty", () => {
    const resolver = makeResolver();
    expect(() => resolver.resolve("")).toThrow(/Unable to resolve the public base URL/);
  });

  it("appends /api/oauth2/callback to the base URL", () => {
    const resolver = makeResolver("https://api.example.com/some/base");
    const uri = resolver.resolve("http://ignored");
    expect(uri).toContain("/api/oauth2/callback");
  });

  it("preserves non-loopback hosts without rewriting", () => {
    const resolver = makeResolver("https://production.example.com");
    const uri = resolver.resolve("http://ignored");
    expect(uri).toContain("production.example.com");
  });
});
