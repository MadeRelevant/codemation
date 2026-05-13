import { describe, expect, it } from "vitest";
import type { McpServerDeclaration } from "@codemation/core";
import { McpServerCatalog } from "../../src/mcp/McpServerCatalog";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

class CapturingLogger implements Logger {
  readonly warns: string[] = [];
  readonly infos: string[] = [];
  info(message: string): void {
    this.infos.push(message);
  }
  warn(message: string): void {
    this.warns.push(message);
  }
  error(_message: string): void {}
  debug(_message: string): void {}
}

class FakeLoggerFactory implements LoggerFactory {
  readonly logger = new CapturingLogger();
  create(_scope: string): Logger {
    return this.logger;
  }
}

function makeDeclaration(id: string, overrides?: Partial<McpServerDeclaration>): McpServerDeclaration {
  return {
    id,
    displayName: `${id} display`,
    description: `${id} description`,
    transport: "http",
    url: `https://${id}.example.com/mcp`,
    credentialKind: "none",
    ...overrides,
  };
}

function makeCatalog(env: NodeJS.ProcessEnv = {}): { catalog: McpServerCatalog; loggerFactory: FakeLoggerFactory } {
  const loggerFactory = new FakeLoggerFactory();
  const fakeAppConfig = { env } as unknown as AppConfig;
  const catalog = new McpServerCatalog(loggerFactory as unknown as LoggerFactory, fakeAppConfig);
  return { catalog, loggerFactory };
}

describe("McpServerCatalog", () => {
  describe("get / getAll basics", () => {
    it("returns undefined for unknown id", () => {
      const { catalog } = makeCatalog();
      expect(catalog.get("unknown")).toBeUndefined();
    });

    it("returns declaration after merge", () => {
      const { catalog } = makeCatalog();
      const decl = makeDeclaration("gmail");
      catalog.merge("plugin", [decl]);
      expect(catalog.get("gmail")).toBe(decl);
    });

    it("getAll returns all merged declarations", () => {
      const { catalog } = makeCatalog();
      const a = makeDeclaration("gmail");
      const b = makeDeclaration("slack");
      catalog.merge("plugin", [a, b]);
      const all = catalog.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(a);
      expect(all).toContain(b);
    });
  });

  describe("source precedence (plugin < config < controlPlane)", () => {
    it("config shadows plugin for same id", () => {
      const { catalog, loggerFactory } = makeCatalog();
      const pluginDecl = makeDeclaration("gmail");
      const configDecl = makeDeclaration("gmail");
      catalog.merge("plugin", [pluginDecl]);
      catalog.merge("config", [configDecl]);
      expect(catalog.get("gmail")).toBe(configDecl);
      expect(loggerFactory.logger.warns).toHaveLength(1);
      expect(loggerFactory.logger.warns[0]).toMatch(/shadowed/);
    });

    it("controlPlane shadows config for same id", () => {
      const { catalog, loggerFactory } = makeCatalog();
      const configDecl = makeDeclaration("gmail");
      const cpDecl = makeDeclaration("gmail");
      catalog.merge("config", [configDecl]);
      catalog.merge("controlPlane", [cpDecl]);
      expect(catalog.get("gmail")).toBe(cpDecl);
      expect(loggerFactory.logger.warns).toHaveLength(1);
      expect(loggerFactory.logger.warns[0]).toMatch(/shadowed/);
    });

    it("controlPlane shadows plugin for same id", () => {
      const { catalog } = makeCatalog();
      const pluginDecl = makeDeclaration("gmail");
      const cpDecl = makeDeclaration("gmail");
      catalog.merge("plugin", [pluginDecl]);
      catalog.merge("controlPlane", [cpDecl]);
      expect(catalog.get("gmail")).toBe(cpDecl);
    });

    it("plugin does NOT shadow config — lower priority is ignored", () => {
      const { catalog, loggerFactory } = makeCatalog();
      const configDecl = makeDeclaration("gmail");
      const pluginDecl = makeDeclaration("gmail");
      catalog.merge("config", [configDecl]);
      catalog.merge("plugin", [pluginDecl]);
      expect(catalog.get("gmail")).toBe(configDecl);
      expect(loggerFactory.logger.warns.some((w) => w.includes("lower-priority"))).toBe(true);
    });

    it("config does NOT shadow controlPlane — lower priority is ignored", () => {
      const { catalog, loggerFactory } = makeCatalog();
      const cpDecl = makeDeclaration("gmail");
      const configDecl = makeDeclaration("gmail");
      catalog.merge("controlPlane", [cpDecl]);
      catalog.merge("config", [configDecl]);
      expect(catalog.get("gmail")).toBe(cpDecl);
      expect(loggerFactory.logger.warns.some((w) => w.includes("lower-priority"))).toBe(true);
    });
  });

  describe("collision logging", () => {
    it("logs a warning when a lower-priority source tries to shadow", () => {
      const { catalog, loggerFactory } = makeCatalog();
      catalog.merge("config", [makeDeclaration("gmail")]);
      catalog.merge("plugin", [makeDeclaration("gmail")]);
      expect(loggerFactory.logger.warns.some((w) => w.includes("lower-priority") && w.includes("gmail"))).toBe(true);
    });

    it("logs a warning when a higher-priority source shadows an existing entry", () => {
      const { catalog, loggerFactory } = makeCatalog();
      catalog.merge("plugin", [makeDeclaration("gmail")]);
      catalog.merge("config", [makeDeclaration("gmail")]);
      expect(loggerFactory.logger.warns.some((w) => w.includes("shadowed") && w.includes("gmail"))).toBe(true);
    });
  });

  describe("clear(source)", () => {
    it("removes declarations added from that source", () => {
      const { catalog } = makeCatalog();
      catalog.merge("plugin", [makeDeclaration("gmail")]);
      catalog.merge("config", [makeDeclaration("slack")]);
      catalog.clear("plugin");
      expect(catalog.get("gmail")).toBeUndefined();
      expect(catalog.get("slack")).toBeDefined();
    });

    it("clear on unknown source is a no-op", () => {
      const { catalog } = makeCatalog();
      catalog.merge("plugin", [makeDeclaration("gmail")]);
      catalog.clear("controlPlane");
      expect(catalog.get("gmail")).toBeDefined();
    });
  });

  describe("validation — invalid id", () => {
    it("skips declaration with uppercase id and logs a warning", () => {
      const { catalog, loggerFactory } = makeCatalog();
      catalog.merge("plugin", [makeDeclaration("Gmail")]);
      expect(catalog.get("Gmail")).toBeUndefined();
      expect(loggerFactory.logger.warns.some((w) => w.includes("invalid id"))).toBe(true);
    });

    it("skips declaration with spaces in id", () => {
      const { catalog } = makeCatalog();
      catalog.merge("plugin", [makeDeclaration("my server")]);
      expect(catalog.getAll()).toHaveLength(0);
    });
  });

  describe("validation — stdio transport", () => {
    it("skips stdio declaration when CODEMATION_ALLOW_STDIO_MCP is unset", () => {
      const { catalog, loggerFactory } = makeCatalog({});
      const decl = makeDeclaration("test-stdio", { transport: "stdio" as "http" });
      catalog.merge("config", [decl]);
      expect(catalog.get("test-stdio")).toBeUndefined();
      expect(loggerFactory.logger.warns.some((w) => w.includes("stdio"))).toBe(true);
    });

    it("accepts stdio declaration when CODEMATION_ALLOW_STDIO_MCP is true", () => {
      const { catalog } = makeCatalog({ CODEMATION_ALLOW_STDIO_MCP: "true" });
      const decl = makeDeclaration("test-stdio", { transport: "stdio" as "http" });
      catalog.merge("config", [decl]);
      expect(catalog.get("test-stdio")).toBe(decl);
    });
  });

  describe("validation — credential requirements", () => {
    it("skips oauth2-via-broker declaration without oauthAppKey", () => {
      const { catalog, loggerFactory } = makeCatalog();
      const decl = makeDeclaration("gmail", { credentialKind: "oauth2-via-broker" });
      catalog.merge("plugin", [decl]);
      expect(catalog.get("gmail")).toBeUndefined();
      expect(loggerFactory.logger.warns.some((w) => w.includes("oauthAppKey"))).toBe(true);
    });

    it("accepts oauth2-via-broker declaration with oauthAppKey", () => {
      const { catalog } = makeCatalog();
      const decl = makeDeclaration("gmail", {
        credentialKind: "oauth2-via-broker",
        oauthAppKey: "google-mail",
      });
      catalog.merge("plugin", [decl]);
      expect(catalog.get("gmail")).toBe(decl);
    });

    it("skips bearer declaration without credentialTypeId", () => {
      const { catalog, loggerFactory } = makeCatalog();
      const decl = makeDeclaration("slack", { credentialKind: "bearer" });
      catalog.merge("plugin", [decl]);
      expect(catalog.get("slack")).toBeUndefined();
      expect(loggerFactory.logger.warns.some((w) => w.includes("credentialTypeId"))).toBe(true);
    });

    it("accepts bearer declaration with credentialTypeId", () => {
      const { catalog } = makeCatalog();
      const decl = makeDeclaration("slack", {
        credentialKind: "bearer",
        credentialTypeId: "bearer-token",
      });
      catalog.merge("plugin", [decl]);
      expect(catalog.get("slack")).toBe(decl);
    });

    it("accepts none declaration without any credential fields", () => {
      const { catalog } = makeCatalog();
      const decl = makeDeclaration("public-mcp", { credentialKind: "none" });
      catalog.merge("plugin", [decl]);
      expect(catalog.get("public-mcp")).toBe(decl);
    });
  });
});
