import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listCommits, getCommit, compareRefs } from "../../src/tools/commits.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("commit tools", () => {
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

  describe("listCommits", () => {
    it("returns normalized commits without leaked fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/repository\/commits/, method: "GET" })
        .reply(200, [
          {
            id: "abc123def456",
            short_id: "abc123de",
            title: "feat: add new feature",
            message: "feat: add new feature\n\nWith details",
            author_name: "John",
            author_email: "john@example.com",
            authored_date: "2025-01-01T00:00:00Z",
            committer_name: "John",
            committer_email: "john@example.com",
            committed_date: "2025-01-01T00:00:01Z",
            created_at: "2025-01-01T00:00:00Z",
            parent_ids: ["parent1"],
            web_url: "https://gitlab.example.com/commit/abc123",
            project_id: 42,
            trailers: {},
            extended_trailers: {},
            stats: { additions: 10, deletions: 2 },
          },
        ]);

      const result = await listCommits({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const commit = parsed[0];
      expect(commit.id).toBe("abc123def456");
      expect(commit.title).toBe("feat: add new feature");
      expect(commit.author_name).toBe("John");
      expect(commit.author_email).toBe("john@example.com");
      expect(commit.committer_name).toBe("John");
      expect(commit.committer_email).toBe("john@example.com");
      expect(commit.authored_date).toBe("2025-01-01T00:00:00Z");
      expect(commit.committed_date).toBe("2025-01-01T00:00:01Z");
      expect(commit.parent_ids).toEqual(["parent1"]);
      expect(commit.web_url).toBe("https://gitlab.example.com/commit/abc123");
      // Filtered fields must NOT be present
      expect(commit).not.toHaveProperty("message");
      expect(commit).not.toHaveProperty("stats");
      expect(commit).not.toHaveProperty("project_id");
      expect(commit).not.toHaveProperty("trailers");
      expect(commit).not.toHaveProperty("extended_trailers");
    });

    it("passes ref, path, since, until params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("ref_name=main");
            expect(p).toContain("path=src");
            expect(p).toContain("since=2025-01-01T00:00:00Z");
            expect(p).toContain("until=2025-01-31T23:59:59Z");
            return p.includes("/api/v4/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listCommits({
        projectIdOrPath: "123",
        ref: "main",
        path: "src",
        since: "2025-01-01T00:00:00Z",
        until: "2025-01-31T23:59:59Z",
      });
    });

    it("URL-encodes project path with nested groups in real request", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("/projects/group%2Fsub%2Fproject/repository/commits");
            return true;
          },
          method: "GET",
        })
        .reply(200, []);

      const result = await listCommits({ projectIdOrPath: "group/sub/project" });
      expect(result.isError).toBe(false);
    });

    it("encodes ref with slashes as query param", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("ref_name=feat%2Fagent");
            return p.includes("/repository/commits");
          },
          method: "GET",
        })
        .reply(200, []);

      await listCommits({ projectIdOrPath: "123", ref: "feat/agent" });
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await listCommits({ projectIdOrPath: "999" });
      expect(result.isError).toBe(true);
    });
  });

  describe("getCommit", () => {
    it("returns commit detail with message and stats, no leaked fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/123\/repository\/commits\/abc123/,
          method: "GET",
        })
        .reply(200, {
          id: "abc123",
          short_id: "abc123",
          title: "fix: bug",
          message: "fix: bug\n\nDetailed description",
          author_name: "Jane",
          author_email: "jane@example.com",
          authored_date: "2025-01-01T00:00:00Z",
          committer_name: "Jane",
          committer_email: "jane@example.com",
          committed_date: "2025-01-01T00:00:00Z",
          created_at: "2025-01-01T00:00:00Z",
          parent_ids: ["parent1"],
          web_url: "https://gitlab.example.com/commit/abc123",
          stats: { additions: 5, deletions: 3, total_changes: 8 },
          trailers: {},
          extended_trailers: {},
          project_id: 42,
        });

      const result = await getCommit({ projectIdOrPath: "123", sha: "abc123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.id).toBe("abc123");
      expect(parsed.title).toBe("fix: bug");
      expect(parsed.message).toBe("fix: bug\n\nDetailed description");
      expect(parsed.author_name).toBe("Jane");
      expect(parsed.author_email).toBe("jane@example.com");
      expect(parsed.committer_name).toBe("Jane");
      expect(parsed.committer_email).toBe("jane@example.com");
      expect(parsed.stats).toEqual({ additions: 5, deletions: 3, total_changes: 8 });
      // Filtered fields must NOT be present
      expect(parsed).not.toHaveProperty("project_id");
      expect(parsed).not.toHaveProperty("trailers");
      expect(parsed).not.toHaveProperty("extended_trailers");
    });

    it("URL-encodes project path and SHA", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: /\/api\/v4\/projects\/group%2Fproject\/repository\/commits\/abc123/,
          method: "GET",
        })
        .reply(200, { id: "abc123", title: "t", author_name: "A", authored_date: "2025-01-01T00:00:00Z", committed_date: "2025-01-01T00:00:00Z", web_url: "https://gitlab.example.com/commit/abc123" });

      const result = await getCommit({ projectIdOrPath: "group/project", sha: "abc123" });
      expect(result.isError).toBe(false);
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await getCommit({ projectIdOrPath: "123", sha: "nonexistent" });
      expect(result.isError).toBe(true);
    });
  });

  describe("compareRefs", () => {
    it("returns commits and diffs between two refs", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            return p.includes("/repository/compare") && p.includes("from=main") && p.includes("to=feature");
          },
          method: "GET",
        })
        .reply(200, {
          commits: [
            {
              id: "aaa",
              short_id: "aaa",
              title: "commit 1",
              author_name: "A",
              authored_date: "2025-01-01T00:00:00Z",
              committed_date: "2025-01-01T00:00:00Z",
              web_url: "https://gitlab.example.com/commit/aaa",
            },
          ],
          diffs: [
            {
              old_path: "a.txt",
              new_path: "a.txt",
              new_file: false,
              deleted_file: false,
              diff: "@@ -1 +1 @@\n-old\n+new\n",
            },
          ],
        });

      const result = await compareRefs({
        projectIdOrPath: "123",
        from: "main",
        to: "feature",
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.commits).toHaveLength(1);
      expect(parsed.commits[0].id).toBe("aaa");
      expect(parsed.diffs).toHaveLength(1);
      expect(parsed.diffs[0].new_path).toBe("a.txt");
      expect(parsed.truncated).toBe(false);
    });

    it("respects maxFiles option", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/repository\/compare/, method: "GET" })
        .reply(200, {
          commits: [],
          diffs: [
            { old_path: "a.txt", new_path: "a.txt", diff: "x" },
            { old_path: "b.txt", new_path: "b.txt", diff: "y" },
            { old_path: "c.txt", new_path: "c.txt", diff: "z" },
          ],
        });

      const result = await compareRefs({
        projectIdOrPath: "123",
        from: "v1.0",
        to: "v2.0",
        maxFiles: 2,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.diffs).toHaveLength(2);
      expect(parsed.truncated).toBe(true);
    });

    it("passes straight param", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("straight=true");
            return p.includes("/repository/compare");
          },
          method: "GET",
        })
        .reply(200, { commits: [], diffs: [] });

      await compareRefs({
        projectIdOrPath: "123",
        from: "main",
        to: "feature",
        straight: true,
      });
    });

    it("URL-encodes project path", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/group%2Fproject\/repository\/compare/, method: "GET" })
        .reply(200, { commits: [], diffs: [] });

      const result = await compareRefs({
        projectIdOrPath: "group/project",
        from: "main",
        to: "dev",
      });
      expect(result.isError).toBe(false);
    });

    it("maxBytes limits final JSON payload size, includes max_bytes in output", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/repository\/compare/, method: "GET" })
        .reply(200, {
          commits: [
            {
              id: "aaa",
              short_id: "aaa",
              title: "commit 1",
              author_name: "A",
              authored_date: "2025-01-01T00:00:00Z",
              committed_date: "2025-01-01T00:00:00Z",
              web_url: "https://gitlab.example.com/commit/aaa",
            },
          ],
          diffs: [
            { old_path: "a.txt", new_path: "a.txt", diff: "x".repeat(1000) },
            { old_path: "b.txt", new_path: "b.txt", diff: "y".repeat(1000) },
          ],
        });

      const result = await compareRefs({
        projectIdOrPath: "123",
        from: "main",
        to: "feature",
        maxBytes: 500,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.max_bytes).toBe(500);
      expect(parsed.truncated).toBe(true);
      const payloadSize = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(500);
    });

    it("CJK diff truncation respects maxBytes", async () => {
      const cjkDiff = "你".repeat(200);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/repository\/compare/, method: "GET" })
        .reply(200, {
          commits: [],
          diffs: [{ old_path: "中文.txt", new_path: "中文.txt", diff: cjkDiff }],
        });

      const result = await compareRefs({
        projectIdOrPath: "123",
        from: "a",
        to: "b",
        maxBytes: 200,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.max_bytes).toBe(200);
      const payloadSize = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(200);
    });

    it("tiny maxBytes is clamped to minimum floor (100), payload fits", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/repository\/compare/, method: "GET" })
        .reply(200, {
          commits: [
            {
              id: "aaa",
              short_id: "aaa",
              title: "t".repeat(100),
              author_name: "A",
              authored_date: "2025-01-01T00:00:00Z",
              committed_date: "2025-01-01T00:00:00Z",
              web_url: "https://gitlab.example.com/commit/aaa",
            },
          ],
          diffs: [{ old_path: "a.txt", new_path: "a.txt", diff: "x".repeat(200) }],
        });

      const result = await compareRefs({
        projectIdOrPath: "123",
        from: "a",
        to: "b",
        maxBytes: 50,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      // maxBytes clamped to 100
      expect(parsed.max_bytes).toBe(100);
      // Structure is stable
      expect(parsed).toHaveProperty("commits");
      expect(parsed).toHaveProperty("diffs");
      expect(parsed).toHaveProperty("truncated");
      expect(parsed).toHaveProperty("max_bytes");
      expect(parsed.truncated).toBe(true);
      const payloadSize = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(100);
    });

    it("encodes branch names with slashes in from/to as query params", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("from=feat%2Fagent");
            expect(p).toContain("to=release%2Fv2");
            return p.includes("/repository/compare");
          },
          method: "GET",
        })
        .reply(200, { commits: [], diffs: [] });

      await compareRefs({
        projectIdOrPath: "123",
        from: "feat/agent",
        to: "release/v2",
      });
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await compareRefs({
        projectIdOrPath: "123",
        from: "a",
        to: "b",
      });
      expect(result.isError).toBe(true);
    });
  });
});
