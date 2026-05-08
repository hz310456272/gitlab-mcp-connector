import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigError } from "./errors.js";

export interface HostConfig {
  baseUrl: string;
  tokenEnv: string;
}

export interface MultiHostConfig {
  defaultHost: string;
  hosts: Record<string, HostConfig>;
}

export interface ResolvedHostConfig {
  baseUrl: string;
  token: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function validateBaseUrl(url: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ConfigError(
      `${label}: "${url}" is not a valid URL. Example: https://gitlab.example.com`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(
      `${label}: "${url}" must use http:// or https:// scheme, got ${parsed.protocol}`,
    );
  }
}

export function loadConfig(): MultiHostConfig {
  const configPath = process.env.GITLAB_MCP_CONFIG;

  if (configPath) {
    const absPath = resolve(configPath);
    let raw: string;
    try {
      raw = readFileSync(absPath, "utf-8");
    } catch {
      throw new ConfigError(
        `Config file not found: ${absPath}. Set GITLAB_MCP_CONFIG to the path of your config.json, or unset it to use simple mode (GITLAB_TOKEN).`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConfigError(
        `Config file is not valid JSON: ${absPath}. Fix the JSON syntax or replace the file.`,
      );
    }

    const config = parsed as MultiHostConfig;
    validateMultiHostConfig(config);

    // Normalize baseUrls before returning
    for (const host of Object.values(config.hosts)) {
      host.baseUrl = normalizeBaseUrl(host.baseUrl);
    }
    return config;
  }

  const baseUrl = process.env.GITLAB_BASE_URL || "https://gitlab.com";
  const token = process.env.GITLAB_TOKEN;

  if (!token) {
    throw new ConfigError(
      "GITLAB_TOKEN is required in simple mode. Set GITLAB_TOKEN to your GitLab personal access token, or use GITLAB_MCP_CONFIG for multi-host mode.",
    );
  }

  validateBaseUrl(baseUrl, "GITLAB_BASE_URL");

  return {
    defaultHost: "default",
    hosts: {
      default: { baseUrl: normalizeBaseUrl(baseUrl), tokenEnv: "GITLAB_TOKEN" },
    },
  };
}

export function resolveHost(
  config: MultiHostConfig,
  host?: string,
): ResolvedHostConfig {
  const hostKey = host || config.defaultHost;
  const hostConfig = config.hosts[hostKey];

  if (!hostConfig) {
    throw new ConfigError(`Unknown host: "${hostKey}". Available: ${Object.keys(config.hosts).join(", ")}. Check the 'host' parameter or 'defaultHost' in config.`);
  }

  const baseUrl = normalizeBaseUrl(hostConfig.baseUrl);
  const token = process.env[hostConfig.tokenEnv];

  if (!token) {
    throw new ConfigError(
      `Token not found for host "${hostKey}": environment variable ${hostConfig.tokenEnv} is not set. Set it before starting the connector.`,
    );
  }

  return { baseUrl, token };
}

function validateMultiHostConfig(config: MultiHostConfig): void {
  if (!config.defaultHost || typeof config.defaultHost !== "string") {
    throw new ConfigError("config.json must have a 'defaultHost' string. Example: \"defaultHost\": \"company\"");
  }
  if (!config.hosts || typeof config.hosts !== "object" || Array.isArray(config.hosts)) {
    throw new ConfigError("config.json must have a 'hosts' object mapping aliases to connection configs.");
  }
  if (!config.hosts[config.defaultHost]) {
    throw new ConfigError(
      `defaultHost "${config.defaultHost}" not found in hosts. Available: ${Object.keys(config.hosts).join(", ") || "(none)"}.`,
    );
  }

  for (const [key, host] of Object.entries(config.hosts)) {
    if (!key) {
      throw new ConfigError("Host alias cannot be empty. Use a non-empty string as the key in 'hosts'.");
    }
    if (!host.baseUrl || typeof host.baseUrl !== "string") {
      throw new ConfigError(`Host "${key}" must have a 'baseUrl' string. Example: "baseUrl": "https://gitlab.example.com"`);
    }
    validateBaseUrl(host.baseUrl, `Host "${key}" baseUrl`);
    if (!host.tokenEnv || typeof host.tokenEnv !== "string") {
      throw new ConfigError(`Host "${key}" must have a 'tokenEnv' string naming the environment variable that holds the token.`);
    }
  }
}
