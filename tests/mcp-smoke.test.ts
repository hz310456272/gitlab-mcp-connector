import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP smoke test", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("completes initialize handshake and exposes expected tools", async () => {
    vi.stubEnv("GITLAB_TOKEN", "test-token");

    const transport = new StdioClientTransport({
      command: "npx",
      args: ["--no-install", "tsx", "src/server.ts"],
      env: { ...process.env, GITLAB_TOKEN: "test-token" } as Record<string, string>,
    });

    const client = new Client({
      name: "smoke-test",
      version: "0.0.1",
    });

    try {
      await client.connect(transport);

      const version = client.getServerVersion();
      expect(version).toBeDefined();
      expect(version?.name).toBe("gitlab-mcp-connector");
      expect(version?.version).toBe("0.2.0");

      const tools = await client.listTools();
      const toolNames = tools.tools.map((t) => t.name);

      const expectedTools = [
        "gitlab_list_projects",
        "gitlab_get_project",
        "gitlab_list_branches",
        "gitlab_list_tags",
        "gitlab_list_merge_requests",
        "gitlab_get_merge_request",
        "gitlab_get_merge_request_diff",
        "gitlab_get_merge_request_comments",
        "gitlab_list_merge_request_pipelines",
        "gitlab_get_pipeline_jobs",
        "gitlab_get_job_log",
        "gitlab_list_repository_tree",
        "gitlab_get_repository_file",
        "gitlab_list_commits",
        "gitlab_get_commit",
        "gitlab_compare_refs",
        "gitlab_list_issues",
        "gitlab_get_issue",
        "gitlab_list_labels",
        "gitlab_list_milestones",
        "gitlab_list_releases",
        "gitlab_get_release",
        "gitlab_list_groups",
        "gitlab_get_group",
        "gitlab_list_group_projects",
        "gitlab_search",
        "gitlab_get_ci_config",
        "gitlab_list_job_artifacts",
        "gitlab_get_job_artifact_file",
      ];

      for (const name of expectedTools) {
        expect(toolNames).toContain(name);
      }
    } finally {
      await client.close();
    }
  });
});
