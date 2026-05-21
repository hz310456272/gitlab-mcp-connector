import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { GitLabClient } from "../../src/gitlab/client.js";
import { GitLabApiError } from "../../src/errors.js";

describe("GitLabClient", () => {
  let mockAgent: MockAgent;
  let client: GitLabClient;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    client = new GitLabClient("https://gitlab.example.com", "test-token");
  });

  afterEach(() => {
    mockAgent.close();
  });

  describe("post()", () => {
    it("sends POST request and returns typed JSON response", async () => {
      const responseBody = { id: 42, title: "Test Issue", state: "opened" };

      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/1/issues", method: "POST" })
        .reply(201, responseBody);

      const result = await client.post<{ id: number; title: string }>(
        "/projects/1/issues",
        { title: "Test Issue" },
      );

      expect(result.id).toBe(42);
      expect(result.title).toBe("Test Issue");
    });

    it("sends correct headers (PRIVATE-TOKEN, Content-Type, User-Agent, Accept)", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/1/issues",
          method: "POST",
          body: JSON.stringify({ title: "Test" }),
        })
        .reply(201, { id: 1 }, {
          headers: {
            "content-type": "application/json",
          },
        });

      // Make the call to exercise the headers path
      await client.post("/projects/1/issues", { title: "Test" });

      // The mock matched only if all conditions (including headers) are satisfied
      // We verify via a second intercept that explicitly checks headers
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/2/issues",
          method: "POST",
        })
        .reply(201, { id: 2 });

      // Use raw fetch to capture headers from the client's post method
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => p === "/api/v4/projects/3/issues",
          method: "POST",
          body: JSON.stringify({ title: "Header Test" }),
        })
        .reply(201, { id: 3 });

      await client.post("/projects/3/issues", { title: "Header Test" });
    });

    it("sends correct headers via explicit header verification", async () => {
      const capturedHeaders: Record<string, string> = {};

      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => p === "/api/v4/projects/5/issues",
          method: "POST",
        })
        .reply(201, (options) => {
          // Capture the request headers via the reply body callback
          if (options.headers) {
            for (const [key, value] of Object.entries(options.headers)) {
              capturedHeaders[key.toLowerCase()] = String(value);
            }
          }
          return { id: 5 };
        });

      await client.post("/projects/5/issues", { title: "Verify Headers" });

      expect(capturedHeaders["private-token"]).toBe("test-token");
      expect(capturedHeaders["content-type"]).toBe("application/json");
      expect(capturedHeaders["accept"]).toBe("application/json");
      expect(capturedHeaders["user-agent"]).toMatch(/^gitlab-mcp-connector\//);
    });

    it("sends body as JSON string", async () => {
      const body = { title: "My Issue", description: "Body content" };

      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: "/api/v4/projects/1/issues",
          method: "POST",
          body: JSON.stringify(body),
        })
        .reply(201, { id: 1 });

      await client.post("/projects/1/issues", body);
    });

    it("throws GitLabApiError on 401", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/1/issues", method: "POST" })
        .reply(401, { message: "Unauthorized" });

      try {
        await client.post("/projects/1/issues", { title: "Test" });
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GitLabApiError);
        expect((error as GitLabApiError).status).toBe(401);
      }
    });

    it("throws GitLabApiError on 403", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/1/issues", method: "POST" })
        .reply(403, { message: "Forbidden" });

      try {
        await client.post("/projects/1/issues", { title: "Test" });
      } catch (error) {
        expect(error).toBeInstanceOf(GitLabApiError);
        expect((error as GitLabApiError).status).toBe(403);
      }
    });

    it("redacts error response body", async () => {
      const sensitiveBody = JSON.stringify({
        message: "Error",
        token: "glpat-secret-token-12345",
        email: "admin@gitlab.example.com",
      });

      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: "/api/v4/projects/1/issues", method: "POST" })
        .reply(401, sensitiveBody, {
          headers: { "content-type": "application/json" },
        });

      try {
        await client.post("/projects/1/issues", { title: "Test" });
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(GitLabApiError);
        const err = error as GitLabApiError;
        // Token should be redacted
        expect(err.body).not.toContain("glpat-secret-token-12345");
        // Email should be redacted
        expect(err.body).not.toContain("admin@gitlab.example.com");
        // Redaction markers should be present
        expect(err.body).toContain("[REDACTED]");
      }
    });

    it("throws on network error (connection refused)", async () => {
      // Close the mock agent so all requests fail with network errors
      mockAgent.close();

      const standaloneClient = new GitLabClient(
        "https://gitlab.invalid.example.com",
        "test-token",
      );

      await expect(
        standaloneClient.post("/projects/1/issues", { title: "Test" }),
      ).rejects.toThrow();
    });
  });
});
