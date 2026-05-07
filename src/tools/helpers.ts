import { loadConfig, resolveHost } from "../config.js";
import { GitLabClient } from "../gitlab/client.js";
import type { MultiHostConfig } from "../config.js";

let cachedConfig: MultiHostConfig | null = null;

function getConfig(): MultiHostConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function getClient(host?: string): GitLabClient {
  const config = getConfig();
  const { baseUrl, token } = resolveHost(config, host);
  return new GitLabClient(baseUrl, token);
}

export function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function errorText(message: string): string {
  return JSON.stringify({ error: message });
}

export interface ToolOutput {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function toolResult(data: unknown): ToolOutput {
  return {
    content: [{ type: "text", text: jsonText(data) }],
    structuredContent: data as Record<string, unknown>,
    isError: false,
  };
}

export function toolError(message: string): ToolOutput {
  return {
    content: [{ type: "text", text: errorText(message) }],
    isError: true,
  };
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}
