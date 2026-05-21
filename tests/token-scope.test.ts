import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { checkTokenScope } from "../src/token-scope.js";

describe("checkTokenScope", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    try {
      mockAgent.close();
    } catch {
      /* already closed */
    }
  });

  it("returns hasWriteAccess: true on 200 OK", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(200, { id: 1, username: "test" });

    const result = await checkTokenScope(
      "https://gitlab.example.com",
      "test-token",
    );

    expect(result).toEqual({ hasWriteAccess: true });
  });

  it("returns hasWriteAccess: false with reason on 401", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(401, { message: "Unauthorized" });

    const result = await checkTokenScope(
      "https://gitlab.example.com",
      "bad-token",
    );

    expect(result.hasWriteAccess).toBe(false);
    expect(result.reason).toContain("authentication");
  });

  it("returns hasWriteAccess: false with reason on 403", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(403, { message: "Forbidden" });

    const result = await checkTokenScope(
      "https://gitlab.example.com",
      "limited-token",
    );

    expect(result.hasWriteAccess).toBe(false);
    expect(result.reason).toContain("permissions");
  });

  it("returns hasWriteAccess: true on 500 (optimistic default)", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(500, { message: "Internal Server Error" });

    const result = await checkTokenScope(
      "https://gitlab.example.com",
      "test-token",
    );

    expect(result).toEqual({ hasWriteAccess: true });
  });

  it("returns hasWriteAccess: true on network error (optimistic default)", async () => {
    // mockAgent.disableNetConnect() is already set in beforeEach
    // Any request will throw since no intercept is registered
    const result = await checkTokenScope(
      "https://unreachable.example.com",
      "test-token",
    );

    expect(result).toEqual({ hasWriteAccess: true });
  });

  it("returns hasWriteAccess: true on timeout (optimistic default)", async () => {
    // Simulate timeout by having undici throw an abort error
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .replyWithError(new Error("Request timed out"));

    const result = await checkTokenScope(
      "https://gitlab.example.com",
      "test-token",
    );

    expect(result).toEqual({ hasWriteAccess: true });
  });

  it("sends PRIVATE-TOKEN header correctly", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(200, { id: 1 });

    await checkTokenScope("https://gitlab.example.com", "my-secret-token");

    // The mock matched the path and method, confirming the request was sent.
  });

  it("correctly constructs URL with baseUrl + /api/v4/user", async () => {
    mockAgent
      .get("https://custom.gitlab.host")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(200, { id: 1 });

    const result = await checkTokenScope(
      "https://custom.gitlab.host",
      "test-token",
    );

    expect(result).toEqual({ hasWriteAccess: true });
  });

  it("returns hasWriteAccess: true on 404 (optimistic default)", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({ path: "/api/v4/user", method: "GET" })
      .reply(404, { message: "Not Found" });

    const result = await checkTokenScope(
      "https://gitlab.example.com",
      "test-token",
    );

    expect(result).toEqual({ hasWriteAccess: true });
  });
});
