import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listMilestones } from "../../src/tools/milestones.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("milestone tools", () => {
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

  const fullMilestoneResponse = {
    id: 3,
    iid: 1,
    title: "v1.0",
    description: "First release",
    state: "active",
    web_url: "https://gitlab.example.com/group/project/-/milestones/1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z",
    due_date: "2025-12-31",
    start_date: "2025-01-01",
    expired: false,
    group_id: 10,
    project_id: 20,
    user_notes_count: 5,
  };

  describe("listMilestones", () => {
    it("returns normalized milestones", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/milestones/, method: "GET" })
        .reply(200, [fullMilestoneResponse]);

      const result = await listMilestones({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        id: 3,
        iid: 1,
        title: "v1.0",
        description: "First release",
        state: "active",
        web_url: "https://gitlab.example.com/group/project/-/milestones/1",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-06-01T00:00:00Z",
        due_date: "2025-12-31",
        start_date: "2025-01-01",
        expired: false,
      });
      expect(data[0]).not.toHaveProperty("group_id");
      expect(data[0]).not.toHaveProperty("project_id");
      expect(data[0]).not.toHaveProperty("user_notes_count");
    });

    it("passes state and search parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("state=active");
            expect(p).toContain("search=v1");
            return p.includes("/api/v4/projects/123/milestones");
          },
          method: "GET",
        })
        .reply(200, []);

      await listMilestones({ projectIdOrPath: "123", state: "active", search: "v1" });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=50");
            return p.includes("/api/v4/projects/123/milestones");
          },
          method: "GET",
        })
        .reply(200, []);

      await listMilestones({ projectIdOrPath: "123", page: 2, perPage: 50 });
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/999\/milestones/, method: "GET" })
        .reply(404, "Not Found");

      const result = await listMilestones({ projectIdOrPath: "999" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });
});
