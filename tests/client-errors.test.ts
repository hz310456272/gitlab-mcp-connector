import { describe, it, expect } from "vitest";
import { GitLabApiError, formatApiError, ConfigError } from "../src/errors.js";
import { encodeProjectPath } from "../src/gitlab/client.js";

describe("GitLabApiError", () => {
  it("stores status, statusText, and body", () => {
    const err = new GitLabApiError(404, "Not Found", "project not found");
    expect(err.status).toBe(404);
    expect(err.statusText).toBe("Not Found");
    expect(err.body).toBe("project not found");
    expect(err.message).toBe("GitLab API error: 404 Not Found");
    expect(err.name).toBe("GitLabApiError");
  });
});

describe("formatApiError", () => {
  it("formats 401", () => {
    const err = new GitLabApiError(401, "Unauthorized", "");
    expect(formatApiError(err)).toContain("Authentication failed");
  });

  it("formats 403", () => {
    const err = new GitLabApiError(403, "Forbidden", "");
    expect(formatApiError(err)).toContain("Access denied");
  });

  it("formats 404", () => {
    const err = new GitLabApiError(404, "Not Found", "");
    expect(formatApiError(err)).toContain("not found");
  });

  it("formats 429", () => {
    const err = new GitLabApiError(429, "Too Many Requests", "");
    expect(formatApiError(err)).toContain("Rate limited");
  });

  it("formats 5xx", () => {
    const err = new GitLabApiError(500, "Internal Server Error", "");
    expect(formatApiError(err)).toContain("server error");
  });

  it("formats unknown status", () => {
    const err = new GitLabApiError(422, "Unprocessable Entity", "");
    expect(formatApiError(err)).toContain("422");
  });

  it("handles generic Error", () => {
    expect(formatApiError(new Error("network failure"))).toBe("network failure");
  });

  it("handles non-Error", () => {
    expect(formatApiError("string error")).toBe("string error");
  });
});

describe("ConfigError", () => {
  it("has correct name", () => {
    const err = new ConfigError("bad config");
    expect(err.name).toBe("ConfigError");
    expect(err.message).toBe("bad config");
  });
});

describe("encodeProjectPath", () => {
  it("encodes slashes in project path", () => {
    expect(encodeProjectPath("group/sub/project")).toBe("group%2Fsub%2Fproject");
  });

  it("handles simple project name", () => {
    expect(encodeProjectPath("my-project")).toBe("my-project");
  });

  it("handles project with special characters", () => {
    expect(encodeProjectPath("group/my project")).toBe("group%2Fmy%20project");
  });
});
