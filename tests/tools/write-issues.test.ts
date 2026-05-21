import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { createIssue, dedupWindow } from "../../src/tools/write-issues.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("gitlab_create_issue", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    resetConfigForTests();
    dedupWindow.clear();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    mockAgent.close();
    vi.unstubAllEnvs();
  });

  const createdIssueResponse = {
    id: 42,
    iid: 7,
    title: "Fix login bug",
    description: "Detailed description here",
    state: "opened",
    web_url: "https://gitlab.example.com/group/project/-/issues/7",
    author: {
      username: "dev",
      name: "Developer",
      id: 5,
      state: "active",
      avatar_url: "https://example.com/avatar.jpg",
      email: "dev@example.com",
    },
    assignees: [
      {
        username: "a1",
        name: "Assignee 1",
        id: 10,
        avatar_url: "https://example.com/a1.jpg",
        email: "a1@example.com",
      },
    ],
    labels: ["bug", "urgent"],
    milestone: {
      id: 3,
      iid: 1,
      title: "v1.0",
      state: "active",
      description: "desc",
      due_date: "2025-12-31",
      group_id: 1,
      project_id: 2,
    },
    type: "issue",
    confidential: true,
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-06-02T12:00:00Z",
    closed_at: null,
    due_date: "2025-12-01",
    project_id: 99,
    user_notes_count: 0,
    time_stats: { time_estimate: 0 },
    weight: 2,
  };

  describe("normal creation", () => {
    it("creates an issue and returns normalized result", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/123/issues",
          method: "POST",
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Fix login bug",
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe(42);
      expect(data.iid).toBe(7);
      expect(data.title).toBe("Fix login bug");
      expect(data.state).toBe("opened");
      expect(data.web_url).toBe("https://gitlab.example.com/group/project/-/issues/7");
    });

    it("response does not contain author.email", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/123/issues",
          method: "POST",
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Fix login bug",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.author).toEqual({ username: "dev", name: "Developer" });
      expect(data.author).not.toHaveProperty("email");
      expect(data.author).not.toHaveProperty("id");
      expect(data.author).not.toHaveProperty("avatar_url");
    });

    it("response does not contain unstable fields like project_id, time_stats", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/123/issues",
          method: "POST",
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Fix login bug",
      });

      const data = JSON.parse(result.content[0].text);
      expect(data).not.toHaveProperty("project_id");
      expect(data).not.toHaveProperty("time_stats");
      expect(data).not.toHaveProperty("user_notes_count");
      expect(data).not.toHaveProperty("weight");
    });

    it("sends labels as comma-separated string in POST body", async () => {
      // Intercept and verify POST body matches exactly
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/456/issues",
          method: "POST",
          body: JSON.stringify({
            title: "Bug report",
            description: "Something is broken",
            labels: "bug,urgent,regression",
            assignee_ids: [10, 20],
            milestone_id: 5,
          }),
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "456",
        title: "Bug report",
        description: "Something is broken",
        labels: ["bug", "urgent", "regression"],
        assigneeIds: [10, 20],
        milestoneId: 5,
      });

      expect(result.isError).toBeFalsy();
    });

    it("sends only provided fields in POST body", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/789/issues",
          method: "POST",
          body: JSON.stringify({
            title: "Minimal issue",
            description: "Just a description",
          }),
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "789",
        title: "Minimal issue",
        description: "Just a description",
      });

      expect(result.isError).toBeFalsy();
    });

    it("does not send labels when empty array", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/789/issues",
          method: "POST",
          body: JSON.stringify({
            title: "No labels issue",
          }),
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "789",
        title: "No labels issue",
        labels: [],
      });

      expect(result.isError).toBeFalsy();
    });

    it("handles project path with slashes by URL-encoding", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/group%2Fsub%2Fproject/issues",
          method: "POST",
        })
        .reply(201, createdIssueResponse);

      const result = await createIssue({
        projectIdOrPath: "group/sub/project",
        title: "Path test",
      });

      expect(result.isError).toBeFalsy();
    });
  });

  describe("error paths", () => {
    it("returns error on 401", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/123/issues",
          method: "POST",
        })
        .reply(401, { message: "Unauthorized" });

      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Will fail",
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      // withWriteSafety catches the error from the handler and returns the raw message
      expect(data.error).toContain("401");
    });

    it("returns error on 404 (project not found)", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/999/issues",
          method: "POST",
        })
        .reply(404, { message: "Not Found" });

      const result = await createIssue({
        projectIdOrPath: "999",
        title: "No project",
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("404");
    });

    it("returns error on 400 (bad request)", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/123/issues",
          method: "POST",
        })
        .reply(400, { message: "Title can't be blank" });

      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Will fail",
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("400");
    });
  });

  describe("dryRun", () => {
    it("returns preview without executing when dryRun=true", async () => {
      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Preview issue",
        description: "Preview description",
        labels: ["bug"],
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.dry_run).toBe(true);
      expect(data.method).toBe("POST");
      expect(data.path).toBe("/projects/123/issues");
      expect(data.body.title).toBe("Preview issue");
      expect(data.body.labels).toBe("bug");
      expect(data.risk_level).toBe("low");
    });

    it("dryRun does not make any API calls", async () => {
      // No mockAgent intercept needed — if any request is made, it will fail
      mockAgent.disableNetConnect();

      const result = await createIssue({
        projectIdOrPath: "123",
        title: "Dry run test",
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
    });
  });
});
