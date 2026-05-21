import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { createMergeRequestNote, createIssueNote } from "../../src/tools/write-notes.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";
import { dedupWindow } from "../../src/write/middleware.js";

describe("write-notes tools", () => {
  let mockAgent: MockAgent;

  const fullNoteResponse = {
    id: 1234,
    type: null,
    body: "This is a comment",
    attachment: null,
    author: {
      id: 5,
      username: "dev",
      name: "Developer",
      email: "dev@example.com",
      state: "active",
      avatar_url: "https://example.com/avatar.jpg",
      web_url: "https://gitlab.example.com/dev",
    },
    created_at: "2025-06-15T10:00:00Z",
    updated_at: "2025-06-15T10:00:00Z",
    system: false,
    noteable_id: 42,
    noteable_type: "MergeRequest",
    noteable_iid: 7,
    project_id: 99,
    resolvable: false,
    resolved: false,
    confidential: false,
    commands_changes: {},
  };

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

  describe("createMergeRequestNote", () => {
    it("creates a note and returns normalized result", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/group%2Fproject\/merge_requests\/7\/notes$/,
          method: "POST",
        })
        .reply(201, fullNoteResponse);

      const result = await createMergeRequestNote({
        projectIdOrPath: "group/project",
        mergeRequestIid: 7,
        body: "This is a comment",
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe(1234);
      expect(data.body).toBe("This is a comment");
      expect(data.author).toEqual({ username: "dev", name: "Developer" });
      expect(data.created_at).toBe("2025-06-15T10:00:00Z");
      expect(data.noteable_type).toBe("MergeRequest");
      expect(data.noteable_iid).toBe(7);
      expect(data.system).toBe(false);
    });

    it("verifies author.email is not present in response", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/merge_requests\/1\/notes$/,
          method: "POST",
        })
        .reply(201, fullNoteResponse);

      const result = await createMergeRequestNote({
        projectIdOrPath: "123",
        mergeRequestIid: 1,
        body: "test",
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.author).not.toHaveProperty("email");
      expect(data.author).not.toHaveProperty("id");
      expect(data.author).not.toHaveProperty("avatar_url");
      expect(data.author).not.toHaveProperty("state");
      expect(data.author).not.toHaveProperty("web_url");
    });

    it("verifies sensitive GitLab fields are removed", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/merge_requests\/1\/notes$/,
          method: "POST",
        })
        .reply(201, fullNoteResponse);

      const result = await createMergeRequestNote({
        projectIdOrPath: "123",
        mergeRequestIid: 1,
        body: "test",
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data).not.toHaveProperty("attachment");
      expect(data).not.toHaveProperty("project_id");
      expect(data).not.toHaveProperty("commands_changes");
    });

    it("returns error on 401 response", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/merge_requests\/1\/notes$/,
          method: "POST",
        })
        .reply(401, { message: "Unauthorized" });

      const result = await createMergeRequestNote({
        projectIdOrPath: "123",
        mergeRequestIid: 1,
        body: "test",
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("Authentication failed");
    });

    it("returns dry-run preview without calling API", async () => {
      // No mock registered — any call would fail the test

      const result = await createMergeRequestNote({
        projectIdOrPath: "group/project",
        mergeRequestIid: 7,
        body: "This is a comment",
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.dry_run).toBe(true);
      expect(data.method).toBe("POST");
      expect(data.path).toContain("merge_requests");
      expect(data.body).toEqual({ body: "This is a comment" });
      expect(data.risk_level).toBe("low");
    });

    it("sends correct POST body to API", async () => {
      let capturedBody: string | null = null;
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/merge_requests\/5\/notes$/,
          method: "POST",
          body: (body) => {
            capturedBody = body;
            return true;
          },
        })
        .reply(201, { ...fullNoteResponse, body: "Hello MR" });

      await createMergeRequestNote({
        projectIdOrPath: "123",
        mergeRequestIid: 5,
        body: "Hello MR",
      });

      expect(capturedBody).toBe('{"body":"Hello MR"}');
    });
  });

  describe("createIssueNote", () => {
    const issueNoteResponse = {
      ...fullNoteResponse,
      noteable_type: "Issue",
      noteable_iid: 3,
    };

    it("creates a note and returns normalized result", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/group%2Fproject\/issues\/3\/notes$/,
          method: "POST",
        })
        .reply(201, issueNoteResponse);

      const result = await createIssueNote({
        projectIdOrPath: "group/project",
        issueIid: 3,
        body: "This is an issue comment",
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe(1234);
      expect(data.body).toBe("This is a comment");
      expect(data.noteable_type).toBe("Issue");
      expect(data.noteable_iid).toBe(3);
      expect(data.author).toEqual({ username: "dev", name: "Developer" });
    });

    it("uses issues path (not merge_requests)", async () => {
      let capturedPath: string | null = null;
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (path) => {
            capturedPath = path;
            return path.includes("/issues/3/notes");
          },
          method: "POST",
        })
        .reply(201, issueNoteResponse);

      await createIssueNote({
        projectIdOrPath: "123",
        issueIid: 3,
        body: "test",
      });

      expect(capturedPath).toContain("/issues/3/notes");
      expect(capturedPath).not.toContain("merge_requests");
    });

    it("returns error on 403 response", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/issues\/1\/notes$/,
          method: "POST",
        })
        .reply(403, { message: "Forbidden" });

      const result = await createIssueNote({
        projectIdOrPath: "123",
        issueIid: 1,
        body: "test",
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("Access denied");
    });

    it("returns dry-run preview without calling API", async () => {
      const result = await createIssueNote({
        projectIdOrPath: "group/project",
        issueIid: 3,
        body: "This is an issue comment",
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.dry_run).toBe(true);
      expect(data.method).toBe("POST");
      expect(data.path).toContain("issues");
      expect(data.body).toEqual({ body: "This is an issue comment" });
      expect(data.risk_level).toBe("low");
    });

    it("verifies author.email is not present in response", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/issues\/1\/notes$/,
          method: "POST",
        })
        .reply(201, issueNoteResponse);

      const result = await createIssueNote({
        projectIdOrPath: "123",
        issueIid: 1,
        body: "test",
      });

      expect(result.isError).toBeFalsy();
      const data = JSON.parse(result.content[0].text);
      expect(data.author).not.toHaveProperty("email");
    });
  });
});
