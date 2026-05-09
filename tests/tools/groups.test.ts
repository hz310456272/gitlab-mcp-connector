import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listGroups, getGroup, listGroupProjects } from "../../src/tools/groups.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("group tools", () => {
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

  const fullGroupResponse = {
    id: 5,
    name: "Backend",
    path: "backend",
    full_path: "company/backend",
    full_name: "Company / Backend",
    description: "Backend services group",
    visibility: "private",
    web_url: "https://gitlab.example.com/groups/company/backend",
    parent_id: 1,
    avatar_url: "https://gitlab.example.com/uploads/avatar.png",
    runners_token: "glrt-xxx",
    statistics: { storage_size: 1024 },
    shared_runners_minutes_limit: 500,
    ldap_cn: "backend-team",
    request_access_enabled: true,
    default_branch_protection: 2,
    shared_with_groups: [{ group_id: 10, group_name: "shared" }],
  };

  const fullProjectResponse = {
    id: 42,
    name: "api-service",
    path_with_namespace: "company/backend/api-service",
    description: "API service",
    default_branch: "main",
    visibility: "private",
    web_url: "https://gitlab.example.com/company/backend/api-service",
    ssh_url_to_repo: "git@gitlab.example.com:company/backend/api-service.git",
    http_url_to_repo: "https://gitlab.example.com/company/backend/api-service.git",
    namespace: { name: "Backend", path: "backend", full_path: "company/backend", kind: "group" },
    avatar_url: "https://gitlab.example.com/uploads/project.png",
    permissions: { project_access: { access_level: 30 } },
    container_registry_enabled: true,
    shared_runners_enabled: true,
  };

  describe("listGroups", () => {
    it("returns normalized groups", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\?/, method: "GET" })
        .reply(200, [fullGroupResponse]);

      const result = await listGroups({});
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        id: 5,
        name: "Backend",
        path: "backend",
        full_path: "company/backend",
        full_name: "Company / Backend",
        description: "Backend services group",
        visibility: "private",
        web_url: "https://gitlab.example.com/groups/company/backend",
        parent_id: 1,
      });
      expect(data[0]).not.toHaveProperty("avatar_url");
      expect(data[0]).not.toHaveProperty("runners_token");
      expect(data[0]).not.toHaveProperty("statistics");
      expect(data[0]).not.toHaveProperty("shared_runners_minutes_limit");
      expect(data[0]).not.toHaveProperty("ldap_cn");
      expect(data[0]).not.toHaveProperty("request_access_enabled");
      expect(data[0]).not.toHaveProperty("shared_with_groups");
    });

    it("returns empty array for no groups", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\?/, method: "GET" })
        .reply(200, []);

      const result = await listGroups({});
      const data = JSON.parse(result.content[0].text);
      expect(data).toEqual([]);
    });

    it("sends correct snake_case API params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("search=backend");
            expect(p).toContain("top_level_only=true");
            expect(p).toContain("order_by=path");
            expect(p).toContain("sort=desc");
            expect(p).not.toContain("topLevelOnly");
            expect(p).not.toContain("orderBy");
            return p.includes("/api/v4/groups?");
          },
          method: "GET",
        })
        .reply(200, []);

      await listGroups({ search: "backend", topLevelOnly: true, orderBy: "path", sort: "desc" });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=10");
            return p.includes("/api/v4/groups?");
          },
          method: "GET",
        })
        .reply(200, []);

      await listGroups({ page: 2, perPage: 10 });
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\?/, method: "GET" })
        .reply(404, "Not Found");

      const result = await listGroups({});
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("getGroup", () => {
    it("returns normalized group by ID", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\/5/, method: "GET" })
        .reply(200, fullGroupResponse);

      const result = await getGroup({ groupIdOrPath: "5" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe(5);
      expect(data.full_path).toBe("company/backend");
      expect(data.parent_id).toBe(1);
    });

    it("handles null parent_id for top-level group", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\/1/, method: "GET" })
        .reply(200, { ...fullGroupResponse, id: 1, parent_id: null, full_path: "company", full_name: "Company" });

      const result = await getGroup({ groupIdOrPath: "1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.parent_id).toBeNull();
    });

    it("URL-encodes group path with slashes", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            const segment = p.split("/groups/")[1].split("?")[0];
            expect(segment).toBe("company%2Fbackend");
            expect(segment).not.toContain("/");
            return true;
          },
          method: "GET",
        })
        .reply(200, fullGroupResponse);

      const result = await getGroup({ groupIdOrPath: "company/backend" });
      expect(result.isError).toBe(false);
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\/999/, method: "GET" })
        .reply(404, "Not Found");

      const result = await getGroup({ groupIdOrPath: "999" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("listGroupProjects", () => {
    it("returns normalized projects", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\/5\/projects/, method: "GET" })
        .reply(200, [fullProjectResponse]);

      const result = await listGroupProjects({ groupIdOrPath: "5" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(42);
      expect(data[0].name).toBe("api-service");
      expect(data[0].path_with_namespace).toBe("company/backend/api-service");
      expect(data[0]).not.toHaveProperty("avatar_url");
      expect(data[0]).not.toHaveProperty("permissions");
      expect(data[0]).not.toHaveProperty("container_registry_enabled");
    });

    it("sends correct snake_case API params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("search=api");
            expect(p).toContain("include_subgroups=true");
            expect(p).toContain("order_by=name");
            expect(p).toContain("visibility=private");
            expect(p).toContain("archived=false");
            expect(p).not.toContain("includeSubgroups");
            expect(p).not.toContain("orderBy");
            return p.includes("/api/v4/groups/5/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listGroupProjects({
        groupIdOrPath: "5",
        search: "api",
        includeSubgroups: true,
        orderBy: "name",
        visibility: "private",
        archived: false,
      });
    });

    it("URL-encodes group path with slashes", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            const groupSegment = p.split("/groups/")[1].split("/projects")[0];
            expect(groupSegment).toBe("company%2Fbackend");
            return true;
          },
          method: "GET",
        })
        .reply(200, []);

      await listGroupProjects({ groupIdOrPath: "company/backend" });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=3");
            expect(p).toContain("per_page=15");
            return p.includes("/api/v4/groups/5/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listGroupProjects({ groupIdOrPath: "5", page: 3, perPage: 15 });
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/groups\/999\/projects/, method: "GET" })
        .reply(404, "Not Found");

      const result = await listGroupProjects({ groupIdOrPath: "999" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });
});
