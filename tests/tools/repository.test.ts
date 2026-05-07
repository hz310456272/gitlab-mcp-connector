import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listBranches, listTags } from "../../src/tools/repository.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("repository tools", () => {
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

  describe("listBranches", () => {
    it("returns normalized branches without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/repository\/branches/, method: "GET" })
        .reply(200, [
          {
            name: "main",
            merged: false,
            protected: true,
            default: true,
            web_url: "https://gitlab.example.com/group/project/-/tree/main",
            commit: { short_id: "abc1234", title: "init", created_at: "2025-01-01T00:00:00Z" },
            developers_can_push: true,
            developers_can_merge: false,
          },
        ]);

      const result = await listBranches({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const branch = parsed[0];
      expect(branch.name).toBe("main");
      expect(branch.merged).toBe(false);
      expect(branch.protected).toBe(true);
      expect(branch.default).toBe(true);
      expect(branch.commit.short_id).toBe("abc1234");

      expect(branch.developers_can_push).toBeUndefined();
      expect(branch.developers_can_merge).toBeUndefined();
    });

    it("URL-encodes project path", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/group%2Fproject\/repository\/branches/, method: "GET" })
        .reply(200, []);

      const result = await listBranches({ projectIdOrPath: "group/project" });
      expect(result.isError).toBe(false);
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(403, { message: "Forbidden" });

      const result = await listBranches({ projectIdOrPath: "123" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access denied");
    });
  });

  describe("listTags", () => {
    it("returns normalized tags without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/repository\/tags/, method: "GET" })
        .reply(200, [
          {
            name: "v1.0.0",
            target: "abc1234def",
            message: "Release v1.0.0",
            protected: false,
            created_at: "2025-01-15T10:00:00Z",
            commit: { short_id: "abc1234", title: "tag commit", created_at: "2025-01-15T09:00:00Z" },
            release: { tag_name: "v1.0.0", description: "Release notes" },
            signatures: [{ gpg_key_id: 42 }],
          },
        ]);

      const result = await listTags({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const tag = parsed[0];
      expect(tag.name).toBe("v1.0.0");
      expect(tag.target).toBe("abc1234def");
      expect(tag.message).toBe("Release v1.0.0");
      expect(tag.protected).toBe(false);
      expect(tag.created_at).toBe("2025-01-15T10:00:00Z");
      expect(tag.commit.short_id).toBe("abc1234");

      expect(tag.release).toBeUndefined();
      expect(tag.signatures).toBeUndefined();
    });

    it("passes order_by and sort params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("order_by=updated");
            expect(p).toContain("sort=desc");
            return p.includes("/api/v4/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listTags({
        projectIdOrPath: "123",
        orderBy: "updated",
        sort: "desc",
      });
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await listTags({ projectIdOrPath: "nonexistent/project" });
      expect(result.isError).toBe(true);
    });
  });
});
