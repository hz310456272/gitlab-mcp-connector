import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listIssues, getIssue } from "../../src/tools/issues.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("issue tools", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    resetConfigForTests();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    mockAgent.close();
    vi.unstubAllEnvs();
  });

  const fullIssueResponse = {
    id: 42,
    iid: 7,
    title: "Fix login bug",
    description: "Detailed description here",
    state: "opened",
    web_url: "https://gitlab.example.com/group/project/-/issues/7",
    author: { username: "dev", name: "Developer", id: 5, state: "active", avatar_url: "https://example.com/avatar.jpg" },
    assignees: [{ username: "a1", name: "Assignee 1", id: 10, avatar_url: "https://example.com/a1.jpg" }],
    labels: ["bug", "urgent"],
    milestone: { id: 3, iid: 1, title: "v1.0", state: "active", description: "desc", due_date: "2025-12-31", group_id: 1, project_id: 2 },
    type: "issue",
    confidential: true,
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-06-02T12:00:00Z",
    closed_at: null,
    due_date: "2025-12-01",
    project_id: 99,
    user_notes_count: 10,
    time_stats: { time_estimate: 3600 },
    weight: 2,
  };

  describe("listIssues", () => {
    it("returns normalized issues from project-level path", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues/, method: "GET" })
        .reply(200, [fullIssueResponse]);

      const result = await listIssues({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].iid).toBe(7);
      expect(data[0].title).toBe("Fix login bug");
      expect(data[0].author).toEqual({ username: "dev", name: "Developer" });
      expect(data[0].assignees).toEqual([{ username: "a1", name: "Assignee 1" }]);
      expect(data[0].labels).toEqual(["bug", "urgent"]);
      expect(data[0].milestone).toEqual({ id: 3, title: "v1.0", state: "active" });
      expect(data[0].type).toBe("issue");
      expect(data[0].confidential).toBe(true);
      expect(data[0]).not.toHaveProperty("project_id");
      expect(data[0]).not.toHaveProperty("time_stats");
      expect(data[0]).not.toHaveProperty("weight");
      expect(data[0]).not.toHaveProperty("user_notes_count");
    });

    it("uses instance-level path when projectIdOrPath is omitted", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/issues\?/, method: "GET" })
        .reply(200, [fullIssueResponse]);

      const result = await listIssues({});
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].iid).toBe(7);
    });

    it("truncates long descriptions in list view", async () => {
      const longDesc = "A".repeat(1000);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues/, method: "GET" })
        .reply(200, [{ ...fullIssueResponse, description: longDesc }]);

      const result = await listIssues({ projectIdOrPath: "123" });
      const data = JSON.parse(result.content[0].text);
      expect(data[0].description.length).toBe(500);
      expect(data[0].description_truncated).toBe(true);
    });

    it("does not set description_truncated for short descriptions", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues/, method: "GET" })
        .reply(200, [{ ...fullIssueResponse, description: "Short" }]);

      const result = await listIssues({ projectIdOrPath: "123" });
      const data = JSON.parse(result.content[0].text);
      expect(data[0].description).toBe("Short");
      expect(data[0]).not.toHaveProperty("description_truncated");
    });

    it("sends correct snake_case API params and no camelCase", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("state=opened");
            expect(p).toContain("labels=bug%2Curgent");
            expect(p).toContain("milestone=v1.0");
            expect(p).toContain("author_username=dev");
            expect(p).toContain("assignee_username=a1");
            expect(p).toContain("search=login");
            expect(p).toContain("created_after=2025-01-01");
            expect(p).toContain("created_before=2025-06-01");
            expect(p).toContain("updated_after=2025-03-01");
            expect(p).toContain("updated_before=2025-09-01");
            expect(p).not.toContain("authorUsername");
            expect(p).not.toContain("assigneeUsername");
            expect(p).not.toContain("createdAfter");
            expect(p).not.toContain("createdBefore");
            expect(p).not.toContain("updatedAfter");
            expect(p).not.toContain("updatedBefore");
            return p.includes("/api/v4/projects/123/issues");
          },
          method: "GET",
        })
        .reply(200, []);

      await listIssues({
        projectIdOrPath: "123",
        state: "opened",
        labels: "bug,urgent",
        milestone: "v1.0",
        authorUsername: "dev",
        assigneeUsername: "a1",
        search: "login",
        createdAfter: "2025-01-01",
        createdBefore: "2025-06-01",
        updatedAfter: "2025-03-01",
        updatedBefore: "2025-09-01",
      });
    });

    it("accepts labels as array and joins with comma", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("labels=bug%2Cfeature");
            return p.includes("/api/v4/projects/123/issues");
          },
          method: "GET",
        })
        .reply(200, []);

      await listIssues({ projectIdOrPath: "123", labels: ["bug", "feature"] });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=50");
            return p.includes("/api/v4/projects/123/issues");
          },
          method: "GET",
        })
        .reply(200, []);

      await listIssues({ projectIdOrPath: "123", page: 2, perPage: 50 });
    });

    it("returns error on 401", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues/, method: "GET" })
        .reply(401, "Unauthorized");

      const result = await listIssues({ projectIdOrPath: "123" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("Authentication failed");
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues/, method: "GET" })
        .reply(404, "Not Found");

      const result = await listIssues({ projectIdOrPath: "123" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  // Issue with metadata close to 1024 bytes — tests max_bytes digit-width convergence
  const heavyMetadataResponse = {
    id: 99999,
    iid: 42,
    title: "A".repeat(200),
    description: "",
    state: "opened",
    web_url: "https://gitlab.example.com/a-very-long-group/a-very-long-subgroup/a-very-long-project/-/issues/42",
    author: { username: "longusername", name: "Long Display Name Here" },
    assignees: [
      { username: "assignee1", name: "First Assignee" },
      { username: "assignee2", name: "Second Assignee" },
    ],
    labels: ["label-alpha", "label-beta", "label-gamma"],
    milestone: { id: 10, title: "Sprint With A Very Long Name", state: "active" },
    type: "incident",
    confidential: true,
    created_at: "2025-06-01T10:00:00.000Z",
    updated_at: "2025-06-02T12:00:00.000Z",
    closed_at: null,
    due_date: "2025-12-31",
  };

  const minimalIssueResponse = {
    id: 1,
    iid: 1,
    title: "t",
    description: "",
    state: "opened",
    web_url: "https://gitlab.example.com/a/-/issues/1",
    author: { username: "u", name: "n" },
    assignees: [],
    labels: [],
    confidential: false,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    closed_at: null,
    due_date: null,
  };

  describe("getIssue", () => {
    it("returns normalized issue with max_bytes=204800 and no truncation for short description", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues\/7/, method: "GET" })
        .reply(200, fullIssueResponse);

      const result = await getIssue({ projectIdOrPath: "123", issueIid: 7 });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.iid).toBe(7);
      expect(data.description).toBe("Detailed description here");
      expect(data.max_bytes).toBe(200 * 1024);
      expect(data).not.toHaveProperty("description_truncated");
      expect(data).not.toHaveProperty("project_id");
      expect(data).not.toHaveProperty("time_stats");
    });

    it("truncates long description by default 200KB limit", async () => {
      const longDesc = "A".repeat(300 * 1024);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues\/7/, method: "GET" })
        .reply(200, { ...fullIssueResponse, description: longDesc });

      const result = await getIssue({ projectIdOrPath: "123", issueIid: 7 });
      const data = JSON.parse(result.content[0].text);
      expect(data.max_bytes).toBe(200 * 1024);
      const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(200 * 1024);
      expect(data.description_truncated).toBe(true);
    });

    it("full issue with maxBytes=500: raises limit to fit metadata, payload <= max_bytes", async () => {
      const longDesc = "A".repeat(10000);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues\/7/, method: "GET" })
        .reply(200, { ...fullIssueResponse, description: longDesc });

      const result = await getIssue({ projectIdOrPath: "123", issueIid: 7, maxBytes: 500 });
      const data = JSON.parse(result.content[0].text);
      expect(data.max_bytes).toBeGreaterThanOrEqual(500);
      const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(data.max_bytes);
      expect(data.description_truncated).toBe(true);
      expect(data).toHaveProperty("iid");
      expect(data).toHaveProperty("title");
      expect(data).toHaveProperty("state");
      expect(data).toHaveProperty("web_url");
      expect(data).toHaveProperty("author");
      expect(data).toHaveProperty("assignees");
      expect(data).toHaveProperty("labels");
      expect(data).toHaveProperty("milestone");
      expect(data).toHaveProperty("confidential");
    });

    it("minimal issue with maxBytes=50: raises to MIN_ISSUE_MAX_BYTES floor, stable fields preserved", async () => {
      const longDesc = "A".repeat(10000);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues\/1/, method: "GET" })
        .reply(200, { ...minimalIssueResponse, description: longDesc });

      const result = await getIssue({ projectIdOrPath: "123", issueIid: 1, maxBytes: 50 });
      const data = JSON.parse(result.content[0].text);
      expect(data.max_bytes).toBeGreaterThanOrEqual(1024);
      const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(data.max_bytes);
      expect(data.description_truncated).toBe(true);
      expect(data).toHaveProperty("iid");
      expect(data).toHaveProperty("title");
      expect(data).toHaveProperty("state");
      expect(data).toHaveProperty("web_url");
      expect(data).toHaveProperty("author");
      expect(data).toHaveProperty("assignees");
      expect(data).toHaveProperty("labels");
      expect(data).toHaveProperty("confidential");
    });

    it("heavy metadata near 1024B: max_bytes converges, payload <= max_bytes", async () => {
      const longDesc = "A".repeat(10000);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues\/42/, method: "GET" })
        .reply(200, { ...heavyMetadataResponse, description: longDesc });

      const result = await getIssue({ projectIdOrPath: "123", issueIid: 42, maxBytes: 500 });
      const data = JSON.parse(result.content[0].text);
      expect(data.max_bytes).toBeGreaterThanOrEqual(500);
      const payloadSize = Buffer.byteLength(JSON.stringify(data), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(data.max_bytes);
      expect(data.description_truncated).toBe(true);
      expect(data).toHaveProperty("iid");
      expect(data).toHaveProperty("title");
      expect(data).toHaveProperty("web_url");
      expect(data).toHaveProperty("author");
      expect(data).toHaveProperty("labels");
      expect(data).toHaveProperty("milestone");
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/issues\/999/, method: "GET" })
        .reply(404, "Not Found");

      const result = await getIssue({ projectIdOrPath: "123", issueIid: 999 });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });
});
