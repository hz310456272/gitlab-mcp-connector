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

export function loadConfig(): MultiHostConfig {
  const configPath = process.env.GITLAB_MCP_CONFIG;

  if (configPath) {
    try {
      const raw = readFileSync(resolve(configPath), "utf-8");
      const parsed = JSON.parse(raw) as MultiHostConfig;
      validateMultiHostConfig(parsed);
      return parsed;
    } catch (e) {
      throw new ConfigError(
        `Failed to load config from ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const baseUrl = process.env.GITLAB_BASE_URL || "https://gitlab.com";
  const token = process.env.GITLAB_TOKEN;

  if (!token) {
    throw new ConfigError(
      "GITLAB_TOKEN is required when not using GITLAB_MCP_CONFIG.",
    );
  }

  return {
    defaultHost: "default",
    hosts: {
      default: { baseUrl, tokenEnv: "GITLAB_TOKEN" },
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
    throw new ConfigError(`Unknown host: "${hostKey}". Available: ${Object.keys(config.hosts).join(", ")}`);
  }

  const baseUrl = hostConfig.baseUrl.replace(/\/+$/, "");
  const token = process.env[hostConfig.tokenEnv];

  if (!token) {
    throw new ConfigError(
      `Token not found: environment variable ${hostConfig.tokenEnv} is not set for host "${hostKey}".`,
    );
  }

  return { baseUrl, token };
}

function validateMultiHostConfig(config: MultiHostConfig): void {
  if (!config.defaultHost || typeof config.defaultHost !== "string") {
    throw new ConfigError("config.json must have a 'defaultHost' string.");
  }
  if (!config.hosts || typeof config.hosts !== "object") {
    throw new ConfigError("config.json must have a 'hosts' object.");
  }
  if (!config.hosts[config.defaultHost]) {
    throw new ConfigError(
      `defaultHost "${config.defaultHost}" not found in hosts.`,
    );
  }
  for (const [key, host] of Object.entries(config.hosts)) {
    if (!host.baseUrl || typeof host.baseUrl !== "string") {
      throw new ConfigError(`Host "${key}" must have a 'baseUrl' string.`);
    }
    if (!host.tokenEnv || typeof host.tokenEnv !== "string") {
      throw new ConfigError(`Host "${key}" must have a 'tokenEnv' string.`);
    }
  }
}
