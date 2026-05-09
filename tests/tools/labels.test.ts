import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listLabels } from "../../src/tools/labels.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("label tools", () => {
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

  const fullLabelResponse = {
    id: 1,
    name: "bug",
    color: "#FF0000",
    text_color: "#FFFFFF",
    description: "Bug report label",
    open_issues_count: 10,
    closed_issues_count: 5,
    open_merge_requests_count: 3,
    subscribed: false,
    priority: 1,
    description_html: "<p>Bug report label</p>",
    is_project_label: true,
  };

  describe("listLabels", () => {
    it("returns normalized labels", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/labels/, method: "GET" })
        .reply(200, [fullLabelResponse]);

      const result = await listLabels({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        id: 1,
        name: "bug",
        color: "#FF0000",
        text_color: "#FFFFFF",
        description: "Bug report label",
      });
      expect(data[0]).not.toHaveProperty("open_issues_count");
      expect(data[0]).not.toHaveProperty("subscribed");
      expect(data[0]).not.toHaveProperty("priority");
    });

    it("passes search parameter", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("search=bug");
            return p.includes("/api/v4/projects/123/labels");
          },
          method: "GET",
        })
        .reply(200, []);

      await listLabels({ projectIdOrPath: "123", search: "bug" });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=50");
            return p.includes("/api/v4/projects/123/labels");
          },
          method: "GET",
        })
        .reply(200, []);

      await listLabels({ projectIdOrPath: "123", page: 2, perPage: 50 });
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/999\/labels/, method: "GET" })
        .reply(404, "Not Found");

      const result = await listLabels({ projectIdOrPath: "999" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });
});
