import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { search } from "../../src/tools/search.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("search tool", () => {
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

  describe("instance-level search", () => {
    it("calls /search and returns { level: 'instance', scope, results }", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/search\?/, method: "GET" })
        .reply(200, [
          { id: 42, iid: 7, project_id: 10, title: "Fix login bug", state: "opened", web_url: "https://gitlab.example.com/group/project/-/issues/7", author: { username: "dev", name: "Developer" }, created_at: "2025-06-01T10:00:00Z" },
        ]);

      const result = await search({ scope: "issues", search: "login bug" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.level).toBe("instance");
      expect(data.scope).toBe("issues");
      expect(data.results).toHaveLength(1);
      expect(data.results[0].project_id).toBe(10);
      expect(data.results[0].iid).toBe(7);
    });

    it("returns empty results for no matches", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/search\?/, method: "GET" })
        .reply(200, []);

      const result = await search({ scope: "users", search: "nonexistent" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.results).toEqual([]);
    });
  });

  describe("group-level search", () => {
    it("calls /groups/:id/search and returns { level: 'group' }", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\/5\/search\?/, method: "GET" })
        .reply(200, [
          { id: 1, name: "api-service", path_with_namespace: "group/api-service", description: "API", default_branch: "main", visibility: "private", web_url: "https://gitlab.example.com/group/api-service" },
        ]);

      const result = await search({ scope: "projects", search: "api", groupIdOrPath: "5" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.level).toBe("group");
      expect(data.scope).toBe("projects");
      expect(data.results[0].name).toBe("api-service");
    });

    it("URL-encodes group path with slashes", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            const segment = p.split("/groups/")[1].split("/search")[0];
            expect(segment).toBe("company%2Fbackend");
            return true;
          },
          method: "GET",
        })
        .reply(200, []);

      const result = await search({ scope: "issues", search: "bug", groupIdOrPath: "company/backend" });
      expect(result.isError).toBe(false);
    });
  });

  describe("project-level search", () => {
    it("calls /projects/:id/search and returns { level: 'project' }", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/10\/search\?/, method: "GET" })
        .reply(200, [
          { id: "abc123", short_id: "abc1", title: "feat: search", project_id: 10, author_name: "dev", authored_date: "2025-06-01T10:00:00Z", web_url: "https://gitlab.example.com/commit/abc" },
        ]);

      const result = await search({ scope: "commits", search: "search", projectIdOrPath: "10" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.level).toBe("project");
      expect(data.results[0].project_id).toBe(10);
    });

    it("URL-encodes project path with slashes", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            const segment = p.split("/projects/")[1].split("/search")[0];
            expect(segment).toBe("company%2Fbackend%2Fapi-service");
            return true;
          },
          method: "GET",
        })
        .reply(200, []);

      const result = await search({ scope: "blobs", search: "TODO", projectIdOrPath: "company/backend/api-service" });
      expect(result.isError).toBe(false);
    });
  });

  describe("parameter passing", () => {
    it("passes ref parameter for blobs", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("ref=develop");
            expect(p).toContain("scope=blobs");
            expect(p).toContain("search=TODO");
            return p.includes("/api/v4/projects/10/search");
          },
          method: "GET",
        })
        .reply(200, []);

      await search({ scope: "blobs", search: "TODO", projectIdOrPath: "10", ref: "develop" });
    });

    it("maps searchType to search_type", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("search_type=advanced");
            expect(p).not.toContain("searchType");
            return p.includes("/api/v4/search");
          },
          method: "GET",
        })
        .reply(200, []);

      await search({ scope: "issues", search: "bug", searchType: "advanced" });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=10");
            return p.includes("/api/v4/search");
          },
          method: "GET",
        })
        .reply(200, []);

      await search({ scope: "issues", search: "bug", page: 2, perPage: 10 });
    });
  });

  describe("parameter validation", () => {
    it("returns error when both projectIdOrPath and groupIdOrPath are set", async () => {
      const result = await search({ scope: "issues", search: "bug", projectIdOrPath: "10", groupIdOrPath: "5" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("cannot both be set");
    });

    it("returns error when scope=projects with projectIdOrPath", async () => {
      const result = await search({ scope: "projects", search: "api", projectIdOrPath: "10" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not valid with projectIdOrPath");
    });

    it("allows ref with project-level blobs and URL-encodes ref value", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("ref=feat%2Fagent");
            expect(p).toContain("scope=blobs");
            return p.includes("/api/v4/projects/10/search");
          },
          method: "GET",
        })
        .reply(200, []);

      const result = await search({ scope: "blobs", search: "TODO", projectIdOrPath: "10", ref: "feat/agent" });
      expect(result.isError).toBe(false);
    });

    it("returns error when ref is used at instance level", async () => {
      const result = await search({ scope: "blobs", search: "TODO", ref: "develop" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("ref is only supported");
    });

    it("returns error when ref is used at group level", async () => {
      const result = await search({ scope: "blobs", search: "TODO", groupIdOrPath: "5", ref: "develop" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("ref is only supported");
    });

    it("returns error when ref is used with unsupported scope", async () => {
      const result = await search({ scope: "issues", search: "bug", projectIdOrPath: "10", ref: "develop" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("ref is only supported");
    });
  });

  describe("error handling", () => {
    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/search\?/, method: "GET" })
        .reply(404, "Not Found");

      const result = await search({ scope: "issues", search: "bug" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });

    it("returns error for Premium scope on non-Premium instance", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/search\?/, method: "GET" })
        .reply(400, '{"error":"scope blobs is only available for Premium instances"}');

      const result = await search({ scope: "blobs", search: "TODO" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  describe("output shape", () => {
    it("structuredContent contains level, scope, results (not items wrapping)", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/search\?/, method: "GET" })
        .reply(200, [
          { id: 5, username: "dev", name: "Developer", state: "active", web_url: "https://gitlab.example.com/dev" },
        ]);

      const result = await search({ scope: "users", search: "dev" });
      expect(result.isError).toBe(false);
      const sc = result.structuredContent as Record<string, unknown>;
      expect(sc.level).toBe("instance");
      expect(sc.scope).toBe("users");
      expect(Array.isArray(sc.results)).toBe(true);
      expect(sc.results).toHaveLength(1);
    });
  });
});
