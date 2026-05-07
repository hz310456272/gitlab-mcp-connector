import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listProjects, getProject } from "../../src/tools/projects.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("projects tools", () => {
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

  const fullProjectResponse = {
    id: 1,
    name: "project-a",
    path_with_namespace: "group/project-a",
    default_branch: "main",
    visibility: "private",
    web_url: "https://gitlab.example.com/group/project-a",
    ssh_url_to_repo: "git@gitlab.example.com:group/project-a.git",
    http_url_to_repo: "https://gitlab.example.com/group/project-a.git",
    namespace: { name: "group", path: "group", full_path: "group", kind: "group" },
    owner: { name: "admin", email: "admin@example.com" },
    permissions: { project_access: { access_level: 40 } },
    avatar_url: "https://example.com/avatar.png",
    statistics: { commit_count: 999 },
  };

  describe("listProjects", () => {
    it("returns normalized project list without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects/, method: "GET" })
        .reply(200, [fullProjectResponse]);

      const result = await listProjects({});
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const project = parsed[0];
      expect(project.id).toBe(1);
      expect(project.name).toBe("project-a");
      expect(project.path_with_namespace).toBe("group/project-a");
      expect(project.default_branch).toBe("main");
      expect(project.visibility).toBe("private");

      expect(project.owner).toBeUndefined();
      expect(project.permissions).toBeUndefined();
      expect(project.avatar_url).toBeUndefined();
      expect(project.statistics).toBeUndefined();
    });

    it("sends correct query params and pagination", async () => {
      // Intercept with precise path that includes expected params
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("search=my-project");
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=50");
            expect(p).not.toContain("perPage");
            return p.includes("/api/v4/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listProjects({ search: "my-project", page: 2, perPage: 50 });
    });

    it("returns error on 401", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects/, method: "GET" })
        .reply(401, { message: "Unauthorized" });

      const result = await listProjects({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Authentication failed");
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await listProjects({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("getProject", () => {
    it("returns normalized project details without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/group%2Fsub%2Fmy-project", method: "GET" })
        .reply(200, {
          ...fullProjectResponse,
          id: 42,
          name: "my-project",
          path_with_namespace: "group/sub/my-project",
          namespace: { name: "sub", path: "sub", full_path: "group/sub", kind: "group" },
        });

      const result = await getProject({ projectIdOrPath: "group/sub/my-project" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(42);
      expect(parsed.name).toBe("my-project");
      expect(parsed.namespace.full_path).toBe("group/sub");

      expect(parsed.owner).toBeUndefined();
      expect(parsed.permissions).toBeUndefined();
      expect(parsed.avatar_url).toBeUndefined();
      expect(parsed.statistics).toBeUndefined();
    });

    it("handles project ID", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/123", method: "GET" })
        .reply(200, { id: 123, name: "test", path_with_namespace: "test" });

      const result = await getProject({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
    });

    it("returns error for non-existent project", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "404 Project Not Found" });

      const result = await getProject({ projectIdOrPath: "nonexistent/project" });
      expect(result.isError).toBe(true);
    });
  });
});
