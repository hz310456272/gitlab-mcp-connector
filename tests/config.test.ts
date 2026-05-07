import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { loadConfig, resolveHost } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds single-host config from env vars", () => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token-123");

    const config = loadConfig();
    expect(config.defaultHost).toBe("default");
    expect(config.hosts.default.baseUrl).toBe("https://gitlab.example.com");
    expect(config.hosts.default.tokenEnv).toBe("GITLAB_TOKEN");
  });

  it("defaults baseUrl to gitlab.com", () => {
    vi.stubEnv("GITLAB_TOKEN", "test-token-123");
    delete process.env.GITLAB_BASE_URL;

    const config = loadConfig();
    expect(config.hosts.default.baseUrl).toBe("https://gitlab.com");
  });

  it("throws when GITLAB_TOKEN is missing in simple mode", () => {
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_BASE_URL;
    delete process.env.GITLAB_MCP_CONFIG;

    expect(() => loadConfig()).toThrow("GITLAB_TOKEN is required");
  });

  it("loads multi-host config from JSON file", () => {
    vi.stubEnv("GITLAB_MCP_CONFIG", "/tmp/test-gitlab-config.json");
    vi.stubEnv("GITLAB_COMPANY_TOKEN", "company-token");

    const config = {
      defaultHost: "company",
      hosts: {
        company: {
          baseUrl: "https://gitlab.example.com",
          tokenEnv: "GITLAB_COMPANY_TOKEN",
        },
      },
    };
    writeFileSync("/tmp/test-gitlab-config.json", JSON.stringify(config));

    const loaded = loadConfig();
    expect(loaded.defaultHost).toBe("company");
    expect(loaded.hosts.company.tokenEnv).toBe("GITLAB_COMPANY_TOKEN");

    unlinkSync("/tmp/test-gitlab-config.json");
  });
});

describe("resolveHost", () => {
  it("resolves default host and reads token from env", () => {
    vi.stubEnv("GITLAB_COMPANY_TOKEN", "secret-token");

    const config = {
      defaultHost: "company",
      hosts: {
        company: {
          baseUrl: "https://gitlab.example.com/",
          tokenEnv: "GITLAB_COMPANY_TOKEN",
        },
      },
    };

    const resolved = resolveHost(config);
    expect(resolved.baseUrl).toBe("https://gitlab.example.com");
    expect(resolved.token).toBe("secret-token");
  });

  it("resolves a named host", () => {
    vi.stubEnv("GITLAB_COM_TOKEN", "glcom-token");

    const config = {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com", tokenEnv: "GITLAB_COMPANY_TOKEN" },
        gitlab: { baseUrl: "https://gitlab.com", tokenEnv: "GITLAB_COM_TOKEN" },
      },
    };

    const resolved = resolveHost(config, "gitlab");
    expect(resolved.baseUrl).toBe("https://gitlab.com");
    expect(resolved.token).toBe("glcom-token");
  });

  it("throws for unknown host", () => {
    const config = {
      defaultHost: "company",
      hosts: { company: { baseUrl: "https://example.com", tokenEnv: "TOKEN" } },
    };

    expect(() => resolveHost(config, "unknown")).toThrow('Unknown host: "unknown"');
  });

  it("throws when token env var is not set", () => {
    delete process.env.MISSING_TOKEN;

    const config = {
      defaultHost: "test",
      hosts: { test: { baseUrl: "https://example.com", tokenEnv: "MISSING_TOKEN" } },
    };

    expect(() => resolveHost(config)).toThrow("MISSING_TOKEN");
  });
});
