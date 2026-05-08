import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, resolveHost } from "../src/config.js";
import { redact } from "../src/redaction.js";

const TMPDIR = "/tmp/gitlab-mcp-test-configs";

function tmpFile(name: string): string {
  return join(TMPDIR, name);
}

function writeTmpConfig(name: string, data: unknown): string {
  const path = tmpFile(name);
  writeFileSync(path, typeof data === "string" ? data : JSON.stringify(data));
  return path;
}

describe("loadConfig — simple mode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.GITLAB_BASE_URL;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_MCP_CONFIG;
  });

  it("defaults baseUrl to https://gitlab.com", () => {
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    const config = loadConfig();
    expect(config.hosts.default.baseUrl).toBe("https://gitlab.com");
  });

  it("uses custom GITLAB_BASE_URL", () => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    const config = loadConfig();
    expect(config.hosts.default.baseUrl).toBe("https://gitlab.example.com");
  });

  it("normalizes trailing slash in baseUrl", () => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com/");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    const config = loadConfig();
    expect(config.hosts.default.baseUrl).toBe("https://gitlab.example.com");
  });

  it("normalizes multiple trailing slashes", () => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com///");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    const config = loadConfig();
    expect(config.hosts.default.baseUrl).toBe("https://gitlab.example.com");
  });

  it("throws when GITLAB_TOKEN is missing", () => {
    expect(() => loadConfig()).toThrow("GITLAB_TOKEN is required");
  });

  it("throws when GITLAB_TOKEN is empty string", () => {
    vi.stubEnv("GITLAB_TOKEN", "");
    expect(() => loadConfig()).toThrow("GITLAB_TOKEN is required");
  });

  it("throws when baseUrl is not a valid URL", () => {
    vi.stubEnv("GITLAB_BASE_URL", "not-a-url");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    expect(() => loadConfig()).toThrow("not a valid URL");
  });

  it("throws when baseUrl uses non-http/https scheme", () => {
    vi.stubEnv("GITLAB_BASE_URL", "file:///etc/passwd");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    expect(() => loadConfig()).toThrow("must use http:// or https://");
  });

  it("does not include token value in error messages", () => {
    vi.stubEnv("GITLAB_BASE_URL", "not-a-url");
    vi.stubEnv("GITLAB_TOKEN", "super-secret-value");
    try {
      loadConfig();
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-value");
    }
  });
});

describe("loadConfig — multi-host mode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.GITLAB_BASE_URL;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GITLAB_MCP_CONFIG;
    mkdirSync(TMPDIR, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(TMPDIR, { recursive: true }); } catch { /* ok */ }
  });

  it("loads valid multi-host config", () => {
    const path = writeTmpConfig("valid.json", {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com", tokenEnv: "GITLAB_COMPANY_TOKEN" },
      },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);

    const config = loadConfig();
    expect(config.defaultHost).toBe("company");
    expect(config.hosts.company.tokenEnv).toBe("GITLAB_COMPANY_TOKEN");
  });

  it("normalizes trailing slashes in multi-host baseUrls", () => {
    const path = writeTmpConfig("slashes.json", {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com/", tokenEnv: "GITLAB_COMPANY_TOKEN" },
      },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);

    const config = loadConfig();
    expect(config.hosts.company.baseUrl).toBe("https://gitlab.example.com");
  });

  it("normalizes multiple trailing slashes in multi-host baseUrls", () => {
    const path = writeTmpConfig("slashes-multi.json", {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com///", tokenEnv: "GITLAB_COMPANY_TOKEN" },
      },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);

    const config = loadConfig();
    expect(config.hosts.company.baseUrl).toBe("https://gitlab.example.com");
  });

  it("throws when config file does not exist", () => {
    vi.stubEnv("GITLAB_MCP_CONFIG", "/tmp/nonexistent-config-test-123.json");
    expect(() => loadConfig()).toThrow("Config file not found");
  });

  it("throws when config file is not valid JSON", () => {
    const path = writeTmpConfig("bad.json", "{ not valid json }");
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("not valid JSON");
  });

  it("does not dump file contents on JSON parse error", () => {
    const path = writeTmpConfig("bad2.json", "{ not valid json }");
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    try {
      loadConfig();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain("not valid json");
    }
  });

  it("throws when defaultHost is missing", () => {
    const path = writeTmpConfig("no-default.json", {
      hosts: { company: { baseUrl: "https://gitlab.example.com", tokenEnv: "TOKEN" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("defaultHost");
  });

  it("throws when hosts is missing", () => {
    const path = writeTmpConfig("no-hosts.json", { defaultHost: "company" });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("hosts");
  });

  it("throws when hosts is not an object (array)", () => {
    const path = writeTmpConfig("hosts-array.json", {
      defaultHost: "company",
      hosts: [],
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("hosts");
  });

  it("throws when defaultHost is not in hosts", () => {
    const path = writeTmpConfig("missing-default.json", {
      defaultHost: "missing",
      hosts: { company: { baseUrl: "https://gitlab.example.com", tokenEnv: "TOKEN" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow('"missing" not found in hosts');
  });

  it("throws when defaultHost is empty string", () => {
    const path = writeTmpConfig("empty-default.json", {
      defaultHost: "",
      hosts: { "": { baseUrl: "https://gitlab.example.com", tokenEnv: "TOKEN" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("defaultHost");
  });

  it("throws when host alias is empty string", () => {
    const path = writeTmpConfig("empty-alias.json", {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com", tokenEnv: "TOKEN" },
        "": { baseUrl: "https://gitlab.com", tokenEnv: "TOKEN" },
      },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("Host alias cannot be empty");
  });

  it("throws when host baseUrl is missing", () => {
    const path = writeTmpConfig("no-baseurl.json", {
      defaultHost: "company",
      hosts: { company: { tokenEnv: "TOKEN" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("baseUrl");
  });

  it("throws when host baseUrl is not a valid URL", () => {
    const path = writeTmpConfig("bad-baseurl.json", {
      defaultHost: "company",
      hosts: { company: { baseUrl: "not-a-url", tokenEnv: "TOKEN" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("not a valid URL");
  });

  it("throws when host baseUrl uses non-http/https scheme", () => {
    const path = writeTmpConfig("ftp-baseurl.json", {
      defaultHost: "company",
      hosts: { company: { baseUrl: "ftp://gitlab.example.com", tokenEnv: "TOKEN" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("must use http:// or https://");
  });

  it("throws when host tokenEnv is missing", () => {
    const path = writeTmpConfig("no-tokenenv.json", {
      defaultHost: "company",
      hosts: { company: { baseUrl: "https://gitlab.example.com" } },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);
    expect(() => loadConfig()).toThrow("tokenEnv");
  });

  it("parses multiple hosts correctly", () => {
    const path = writeTmpConfig("multi.json", {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com", tokenEnv: "GITLAB_COMPANY_TOKEN" },
        gitlab: { baseUrl: "https://gitlab.com", tokenEnv: "GITLAB_COM_TOKEN" },
      },
    });
    vi.stubEnv("GITLAB_MCP_CONFIG", path);

    const config = loadConfig();
    expect(Object.keys(config.hosts)).toHaveLength(2);
    expect(config.hosts.company.tokenEnv).toBe("GITLAB_COMPANY_TOKEN");
    expect(config.hosts.gitlab.tokenEnv).toBe("GITLAB_COM_TOKEN");
  });
});

describe("resolveHost", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves default host and reads token from env", () => {
    vi.stubEnv("GITLAB_COMPANY_TOKEN", "secret-token");

    const config = {
      defaultHost: "company",
      hosts: {
        company: { baseUrl: "https://gitlab.example.com/", tokenEnv: "GITLAB_COMPANY_TOKEN" },
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

  it("throws when token env var is empty string", () => {
    vi.stubEnv("EMPTY_TOKEN", "");

    const config = {
      defaultHost: "test",
      hosts: { test: { baseUrl: "https://example.com", tokenEnv: "EMPTY_TOKEN" } },
    };

    expect(() => resolveHost(config)).toThrow("EMPTY_TOKEN");
  });

  it("does not include token value in error messages", () => {
    vi.stubEnv("SECRET_TOKEN", "should-not-appear");

    const config = {
      defaultHost: "test",
      hosts: { test: { baseUrl: "https://example.com", tokenEnv: "NONEXISTENT_TOKEN" } },
    };

    try {
      resolveHost(config);
    } catch (e) {
      expect((e as Error).message).not.toContain("should-not-appear");
    }
  });
});

describe("config errors through redact()", () => {
  it("strips private_token from config error output", () => {
    const msg = 'Token not found: environment variable MY_TOKEN is not set for host "test". private_token=secret123';
    const result = redact(msg);
    expect(result).not.toContain("secret123");
    expect(result).toContain("[REDACTED]");
  });

  it("strips access_token from config error output", () => {
    const msg = 'Config error with access_token=abc456 in message';
    const result = redact(msg);
    expect(result).not.toContain("abc456");
  });

  it("strips token JSON field from config error output", () => {
    const msg = 'Config: {"token":"super-secret-value"}';
    const result = redact(msg);
    expect(result).not.toContain("super-secret-value");
  });
});
