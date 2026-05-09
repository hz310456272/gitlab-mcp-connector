import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listReleases, getRelease } from "../../src/tools/releases.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("release tools", () => {
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

  const fullReleaseResponse = {
    tag_name: "v1.0.0",
    name: "Version 1.0.0",
    description: "This is the first stable release.\nIncludes bug fixes and new features.",
    created_at: "2025-06-01T10:00:00Z",
    released_at: "2025-06-01T10:00:00Z",
    upcoming_release: false,
    author: {
      id: 5,
      username: "dev",
      name: "Developer",
      state: "active",
      avatar_url: "https://example.com/avatar.jpg",
      public_email: "dev@example.com",
      web_url: "https://gitlab.example.com/dev",
      locked: false,
    },
    commit: {
      id: "abc123def456",
      short_id: "abc123de",
      title: "Release commit",
      message: "Release commit\n\nWith details",
      author_name: "dev",
      author_email: "dev@example.com",
      authored_date: "2025-05-30T10:00:00Z",
      committer_name: "dev",
      committer_email: "dev@example.com",
      committed_date: "2025-05-30T10:00:00Z",
      parent_ids: ["parent1"],
      trailers: {},
      web_url: "https://gitlab.example.com/commit/abc123",
    },
    commit_path: "/group/project/-/commit/abc123",
    tag_path: "/group/project/-/tags/v1.0.0",
    milestones: [
      { id: 1, iid: 1, title: "v1.0", state: "closed", description: "M1", due_date: "2025-06-01", project_id: 42 },
    ],
    assets: {
      count: 2,
      sources: [
        { format: "zip", url: "https://gitlab.example.com/archive.zip" },
        { format: "tar.gz", url: "https://gitlab.example.com/archive.tar.gz" },
      ],
      links: [
        { id: 10, name: "binary", url: "https://example.com/download", external: true, link_type: "other" },
        { id: 11, name: "package", url: "https://gitlab.example.com/package.rpm", external: false, link_type: "package" },
      ],
    },
    evidences: [{ sha: "abc", filepath: "evidence.json" }],
    _links: { self: "https://gitlab.example.com/releases/v1.0.0" },
  };

  describe("listReleases", () => {
    it("returns normalized releases", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/releases/, method: "GET" })
        .reply(200, [fullReleaseResponse]);

      const result = await listReleases({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual({
        tag_name: "v1.0.0",
        name: "Version 1.0.0",
        description: "This is the first stable release.\nIncludes bug fixes and new features.",
        description_truncated: false,
        created_at: "2025-06-01T10:00:00Z",
        released_at: "2025-06-01T10:00:00Z",
        author: { username: "dev", name: "Developer" },
        commit: { short_id: "abc123de", title: "Release commit", authored_date: "2025-05-30T10:00:00Z" },
        milestones: [{ id: 1, title: "v1.0", state: "closed" }],
        assets: {
          count: 2,
          links: [
            { id: 10, name: "binary", url: "https://example.com/download", external: true, link_type: "other" },
            { id: 11, name: "package", url: "https://gitlab.example.com/package.rpm", external: false, link_type: "package" },
          ],
        },
      });
      expect(data[0]).not.toHaveProperty("upcoming_release");
      expect(data[0]).not.toHaveProperty("_links");
      expect(data[0]).not.toHaveProperty("evidences");
      expect(data[0]).not.toHaveProperty("tag_path");
    });

    it("truncates long descriptions in list view", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/releases/, method: "GET" })
        .reply(200, [{ ...fullReleaseResponse, description: "A".repeat(1000) }]);

      const result = await listReleases({ projectIdOrPath: "123" });
      const data = JSON.parse(result.content[0].text);
      expect(data[0].description.length).toBe(500);
      expect(data[0].description_truncated).toBe(true);
    });

    it("sets description_truncated=false for short descriptions", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/releases/, method: "GET" })
        .reply(200, [{ ...fullReleaseResponse, description: "Short" }]);

      const result = await listReleases({ projectIdOrPath: "123" });
      const data = JSON.parse(result.content[0].text);
      expect(data[0].description).toBe("Short");
      expect(data[0].description_truncated).toBe(false);
    });

    it("sends correct snake_case API params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("tag_name=v1.0");
            expect(p).toContain("order_by=released_at");
            expect(p).not.toContain("tagName");
            expect(p).not.toContain("orderBy");
            return p.includes("/api/v4/projects/123/releases");
          },
          method: "GET",
        })
        .reply(200, []);

      await listReleases({
        projectIdOrPath: "123",
        tagName: "v1.0",
        orderBy: "released_at",
        sort: "desc",
      });
    });

    it("passes pagination parameters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("page=2");
            expect(p).toContain("per_page=10");
            return p.includes("/api/v4/projects/123/releases");
          },
          method: "GET",
        })
        .reply(200, []);

      await listReleases({ projectIdOrPath: "123", page: 2, perPage: 10 });
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/999\/releases/, method: "GET" })
        .reply(404, "Not Found");

      const result = await listReleases({ projectIdOrPath: "999" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("getRelease", () => {
    it("returns normalized release with description_truncated=false", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/releases\/v1\.0\.0/, method: "GET" })
        .reply(200, fullReleaseResponse);

      const result = await getRelease({ projectIdOrPath: "123", tagName: "v1.0.0" });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.tag_name).toBe("v1.0.0");
      expect(data.name).toBe("Version 1.0.0");
      expect(data.description).toBe("This is the first stable release.\nIncludes bug fixes and new features.");
      expect(data.description_truncated).toBe(false);
      expect(data.author).toEqual({ username: "dev", name: "Developer" });
      expect(data.commit.short_id).toBe("abc123de");
      expect(data.milestones).toHaveLength(1);
      expect(data.assets.count).toBe(2);
      expect(data).not.toHaveProperty("_links");
      expect(data).not.toHaveProperty("evidences");
    });

    it("URL-encodes tag names with special characters", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            // "release/v1.0" → encoded as "release%2Fv1.0"
            // Must NOT contain a bare slash in the tag segment
            const tagSegment = p.split("/releases/")[1].split("?")[0];
            expect(tagSegment).toBe("release%2Fv1.0");
            expect(tagSegment).not.toContain("/");
            return true;
          },
          method: "GET",
        })
        .reply(200, fullReleaseResponse);

      const result = await getRelease({ projectIdOrPath: "123", tagName: "release/v1.0" });
      expect(result.isError).toBe(false);
    });

    it("URL-encodes tag names with plus sign", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            // "v1.0+build" → "v1.0%2Bbuild"
            const tagSegment = p.split("/releases/")[1].split("?")[0];
            expect(tagSegment).toBe("v1.0%2Bbuild");
            return true;
          },
          method: "GET",
        })
        .reply(200, fullReleaseResponse);

      const result = await getRelease({ projectIdOrPath: "123", tagName: "v1.0+build" });
      expect(result.isError).toBe(false);
    });

    it("handles null commit and empty milestones", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/releases\/v2/, method: "GET" })
        .reply(200, { ...fullReleaseResponse, tag_name: "v2", commit: null, milestones: [], assets: null });

      const result = await getRelease({ projectIdOrPath: "123", tagName: "v2" });
      const data = JSON.parse(result.content[0].text);
      expect(data.commit).toBeUndefined();
      expect(data.milestones).toEqual([]);
      expect(data.assets.count).toBe(0);
      expect(data.assets.links).toEqual([]);
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/releases\/nonexistent/, method: "GET" })
        .reply(404, "Not Found");

      const result = await getRelease({ projectIdOrPath: "123", tagName: "nonexistent" });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });
});
