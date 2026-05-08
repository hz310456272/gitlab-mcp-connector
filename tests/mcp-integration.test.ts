import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer, type Server } from "node:http";

function startMockGitLab(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });

      if (req.url?.includes("/api/v4/projects/123/repository/branches")) {
        res.end(
          JSON.stringify([
            { name: "main", default: true, merged: false, protected: true, web_url: "https://gitlab.example.com/group/project/-/tree/main", commit: { short_id: "abc1234", title: "init" } },
          ]),
        );
      } else if (req.url?.includes("/api/v4/projects")) {
        res.end(
          JSON.stringify([
            { id: 1, name: "project-a", path_with_namespace: "group/project-a", default_branch: "main", visibility: "private", web_url: "https://gitlab.example.com/group/project-a" },
          ]),
        );
      } else {
        res.end(JSON.stringify([]));
      }
    });

    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

interface ToolCallResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

describe("MCP integration test: tool calls with structuredContent", () => {
  let mockServer: Server;
  let mockPort: number;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    const { server, port } = await startMockGitLab();
    mockServer = server;
    mockPort = port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it("calls gitlab_list_projects and returns valid structuredContent", async () => {
    vi.stubEnv("GITLAB_BASE_URL", `http://127.0.0.1:${mockPort}`);
    vi.stubEnv("GITLAB_TOKEN", "test-token");

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["--no-install", "tsx", "src/server.ts"],
      env: {
        ...process.env,
        GITLAB_BASE_URL: `http://127.0.0.1:${mockPort}`,
        GITLAB_TOKEN: "test-token",
      } as Record<string, string>,
    });

    const client = new Client({ name: "integration-test", version: "0.0.1" });

    try {
      await client.connect(transport);

      const result = (await client.callTool({
        name: "gitlab_list_projects",
        arguments: {},
      })) as unknown as ToolCallResult;

      expect(result.content).toBeDefined();
      const text = result.content[0];
      expect(text.type).toBe("text");
      const parsed = JSON.parse(text.text!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("project-a");

      // structuredContent must be a record, not a raw array
      expect(result.structuredContent).toBeDefined();
      expect(typeof result.structuredContent).toBe("object");
      expect(Array.isArray(result.structuredContent)).toBe(false);
      expect(Array.isArray(result.structuredContent!.items)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("calls gitlab_list_branches and returns valid structuredContent", async () => {
    vi.stubEnv("GITLAB_BASE_URL", `http://127.0.0.1:${mockPort}`);
    vi.stubEnv("GITLAB_TOKEN", "test-token");

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["--no-install", "tsx", "src/server.ts"],
      env: {
        ...process.env,
        GITLAB_BASE_URL: `http://127.0.0.1:${mockPort}`,
        GITLAB_TOKEN: "test-token",
      } as Record<string, string>,
    });

    const client = new Client({ name: "integration-test", version: "0.0.1" });

    try {
      await client.connect(transport);

      const result = (await client.callTool({
        name: "gitlab_list_branches",
        arguments: { projectIdOrPath: "123" },
      })) as unknown as ToolCallResult;

      const text = result.content[0];
      expect(text.type).toBe("text");
      const parsed = JSON.parse(text.text!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("main");

      expect(result.structuredContent).toBeDefined();
      expect(Array.isArray(result.structuredContent)).toBe(false);
      expect(Array.isArray(result.structuredContent!.items)).toBe(true);
      expect((result.structuredContent!.items as Array<Record<string, unknown>>)[0].name).toBe("main");
    } finally {
      await client.close();
    }
  });
});
