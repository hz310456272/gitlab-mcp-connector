import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import {
  listMergeRequests,
  getMergeRequest,
  getMergeRequestDiff,
  getMergeRequestComments,
  listMergeRequestPipelines,
} from "../../src/tools/mergeRequests.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("merge request tools", () => {
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

  const fullMrResponse = {
    id: 100,
    iid: 7,
    title: "Fix login bug",
    description: "This fixes the login issue",
    state: "opened",
    web_url: "https://gitlab.example.com/group/project/-/merge_requests/7",
    source_branch: "fix-login",
    target_branch: "main",
    author: { username: "dev", name: "Developer", id: 5, state: "active", avatar_url: "https://example.com/avatar.jpg" },
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-06-02T12:00:00Z",
    merged_at: null,
    draft: false,
    merge_status: "can_be_merged",
    labels: ["bug", "urgent"],
    assignees: [{ username: "reviewer", name: "Reviewer" }],
    reviewers: [
      { username: "reviewer2", name: "Reviewer2", id: 10, state: "active", avatar_url: "https://example.com/r2.jpg" },
      { username: "reviewer3", name: "Reviewer3", email: "r3@example.com" },
    ],
    permissions: { project_access: { access_level: 40 } },
    user_notes_count: 5,
  };

  describe("listMergeRequests", () => {
    it("returns normalized MRs with reviewers (username/name only)", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/merge_requests/, method: "GET" })
        .reply(200, [fullMrResponse]);

      const result = await listMergeRequests({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      const mr = parsed[0];

      expect(mr.author.username).toBe("dev");
      expect(mr.author.name).toBe("Developer");
      expect(mr.author.id).toBeUndefined();
      expect(mr.author.avatar_url).toBeUndefined();

      expect(mr.reviewers).toHaveLength(2);
      expect(mr.reviewers[0]).toEqual({ username: "reviewer2", name: "Reviewer2" });
      expect(mr.reviewers[1]).toEqual({ username: "reviewer3", name: "Reviewer3" });

      expect(mr.assignees).toBeUndefined();
      expect(mr.permissions).toBeUndefined();
      expect(mr.user_notes_count).toBeUndefined();
    });

    it("uses instance-level endpoint when projectIdOrPath is omitted", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/merge_requests/, method: "GET" })
        .reply(200, []);

      const result = await listMergeRequests({});
      expect(result.isError).toBe(false);
    });

    it("sends correct API params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("state=opened");
            expect(p).toContain("scope=assigned_to_me");
            expect(p).toContain("author_username=dev");
            expect(p).toContain("page=1");
            return p.includes("/api/v4/merge_requests");
          },
          method: "GET",
        })
        .reply(200, []);

      await listMergeRequests({
        state: "opened",
        scope: "assigned_to_me",
        authorUsername: "dev",
      });
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/merge_requests/, method: "GET" })
        .reply(401, { message: "Unauthorized" });

      const result = await listMergeRequests({});
      expect(result.isError).toBe(true);
    });
  });

  describe("getMergeRequest", () => {
    it("returns normalized MR details with reviewers", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/123/merge_requests/7", method: "GET" })
        .reply(200, fullMrResponse);

      const result = await getMergeRequest({ projectIdOrPath: "123", mergeRequestIid: 7 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.iid).toBe(7);
      expect(parsed.labels).toEqual(["bug", "urgent"]);
      expect(parsed.reviewers).toHaveLength(2);
      expect(parsed.reviewers[0]).toEqual({ username: "reviewer2", name: "Reviewer2" });

      expect(parsed.permissions).toBeUndefined();
      expect(parsed.assignees).toBeUndefined();
    });

    it("returns error for non-existent MR", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/merge_requests\/999/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await getMergeRequest({ projectIdOrPath: "123", mergeRequestIid: 999 });
      expect(result.isError).toBe(true);
    });
  });

  describe("getMergeRequestDiff", () => {
    it("returns normalized diffs without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/merge_requests\/7\/diffs/, method: "GET" })
        .reply(200, [
          {
            old_path: "src/login.ts",
            new_path: "src/login.ts",
            new_file: false,
            deleted_file: false,
            diff: "@@ -1,3 +1,4 @@\n+import { fix } from './fix';\n",
            too_large: false,
            collapsed: false,
            binary: false,
          },
        ]);

      const result = await getMergeRequestDiff({ projectIdOrPath: "123", mergeRequestIid: 7 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.diffs).toHaveLength(1);
      expect(parsed.diffs[0].new_path).toBe("src/login.ts");
      expect(parsed.truncated).toBe(false);

      expect(parsed.diffs[0].too_large).toBeUndefined();
      expect(parsed.diffs[0].collapsed).toBeUndefined();
      expect(parsed.diffs[0].binary).toBeUndefined();
    });

    it("truncates by maxFiles", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/merge_requests\/.*\/diffs/, method: "GET" })
        .reply(200, [
          { old_path: "a.ts", new_path: "a.ts", diff: "diff1" },
          { old_path: "b.ts", new_path: "b.ts", diff: "diff2" },
          { old_path: "c.ts", new_path: "c.ts", diff: "diff3" },
        ]);

      const result = await getMergeRequestDiff({ projectIdOrPath: "123", mergeRequestIid: 7, maxFiles: 2 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.diffs).toHaveLength(2);
      expect(parsed.truncated).toBe(true);
    });

    it("truncates by maxBytes with large diff", async () => {
      const largeDiff = "x".repeat(5000);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/merge_requests\/.*\/diffs/, method: "GET" })
        .reply(200, [
          { old_path: "big.ts", new_path: "big.ts", diff: largeDiff },
          { old_path: "small.ts", new_path: "small.ts", diff: "ok" },
        ]);

      const result = await getMergeRequestDiff({ projectIdOrPath: "123", mergeRequestIid: 7, maxBytes: 500 });
      const parsed = JSON.parse(result.content[0].text);
      const payloadBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadBytes).toBeLessThanOrEqual(500);
      expect(parsed.truncated).toBe(true);
    });

    it("handles very small maxBytes budget", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/merge_requests\/.*\/diffs/, method: "GET" })
        .reply(200, [
          { old_path: "src/login.ts", new_path: "src/login.ts", diff: "x".repeat(200) },
        ]);

      const result = await getMergeRequestDiff({ projectIdOrPath: "123", mergeRequestIid: 7, maxBytes: 80 });
      const parsed = JSON.parse(result.content[0].text);
      const payloadBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadBytes).toBeLessThanOrEqual(80);
      expect(parsed.truncated).toBe(true);
    });

    it("correctly truncates multi-byte UTF-8 diff content", async () => {
      const cjkDiff = "修复登录问题：新增验证逻辑 🔧\n" + "中文注释行\n".repeat(50);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/merge_requests\/.*\/diffs/, method: "GET" })
        .reply(200, [
          { old_path: "src/修复.ts", new_path: "src/修复.ts", diff: cjkDiff },
        ]);

      const result = await getMergeRequestDiff({ projectIdOrPath: "123", mergeRequestIid: 7, maxBytes: 200 });
      const parsed = JSON.parse(result.content[0].text);
      const payloadBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadBytes).toBeLessThanOrEqual(200);
      expect(parsed.truncated).toBe(true);
    });
  });

  describe("getMergeRequestComments", () => {
    it("returns flattened notes with position (no sha leaked)", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/merge_requests\/7\/discussions/, method: "GET" })
        .reply(200, [
          {
            id: "disc-1",
            individual_note: false,
            notes: [
              {
                id: 101,
                type: "DiscussionNote",
                author: { username: "reviewer", name: "Reviewer", avatar_url: "https://example.com/avatar.jpg" },
                body: "Please fix this",
                created_at: "2025-06-01T11:00:00Z",
                system: false,
                resolvable: true,
                resolved: true,
                resolved_by: { username: "dev" },
                commands_changes: {},
                position: {
                  old_path: "src/login.ts",
                  new_path: "src/login.ts",
                  old_line: 10,
                  new_line: 11,
                  line_range: { start: { new_line: 10 }, end: { new_line: 15 } },
                  base_sha: "aaa111",
                  start_sha: "bbb222",
                  head_sha: "ccc333",
                  position_type: "text",
                },
              },
              {
                id: 102,
                type: null,
                author: { username: "bot", name: "GitBot", avatar_url: "https://example.com/bot.jpg" },
                body: "assigned to @reviewer",
                created_at: "2025-06-01T10:30:00Z",
                system: true,
                resolvable: false,
                resolved: false,
              },
            ],
          },
        ]);

      const result = await getMergeRequestComments({ projectIdOrPath: "123", mergeRequestIid: 7 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);

      const userComment = parsed[0];
      expect(userComment.discussion_id).toBe("disc-1");
      expect(userComment.note_id).toBe(101);
      expect(userComment.type).toBe("user");
      expect(userComment.author).toBe("reviewer");
      expect(userComment.resolvable).toBe(true);
      expect(userComment.resolved).toBe(true);

      // Position stable fields present
      expect(userComment.position.old_path).toBe("src/login.ts");
      expect(userComment.position.new_path).toBe("src/login.ts");
      expect(userComment.position.old_line).toBe(10);
      expect(userComment.position.new_line).toBe(11);
      expect(userComment.position.line_range).toEqual({ start: { new_line: 10 }, end: { new_line: 15 } });

      // SHA fields not leaked
      expect(userComment.position.base_sha).toBeUndefined();
      expect(userComment.position.start_sha).toBeUndefined();
      expect(userComment.position.head_sha).toBeUndefined();
      expect(userComment.position.position_type).toBeUndefined();

      // No extra note-level fields
      expect(userComment.resolved_by).toBeUndefined();
      expect(userComment.commands_changes).toBeUndefined();

      const systemNote = parsed[1];
      expect(systemNote.type).toBe("system");
      expect(systemNote.position).toBeUndefined();
    });
  });

  describe("listMergeRequestPipelines", () => {
    it("returns normalized pipelines without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/merge_requests\/7\/pipelines/, method: "GET" })
        .reply(200, [
          {
            id: 501,
            status: "success",
            ref: "fix-login",
            sha: "abc1234def5678",
            created_at: "2025-06-01T10:05:00Z",
            updated_at: "2025-06-01T10:15:00Z",
            web_url: "https://gitlab.example.com/group/project/-/pipelines/501",
            user: { username: "dev" },
            coverage: 85.5,
            detailed_status: { group: "success" },
          },
        ]);

      const result = await listMergeRequestPipelines({ projectIdOrPath: "123", mergeRequestIid: 7 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const pipeline = parsed[0];
      expect(pipeline.id).toBe(501);
      expect(pipeline.status).toBe("success");
      expect(pipeline.ref).toBe("fix-login");
      expect(pipeline.sha).toBe("abc1234def5678");

      expect(pipeline.user).toBeUndefined();
      expect(pipeline.coverage).toBeUndefined();
      expect(pipeline.detailed_status).toBeUndefined();
    });
  });
});
