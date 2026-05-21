import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { createMergeRequest } from "../../src/tools/write-mrs.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";
import { dedupWindow } from "../../src/write/middleware.js";

describe("gitlab_create_merge_request", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    resetConfigForTests();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    dedupWindow.clear();
  });

  afterEach(() => {
    mockAgent.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const fullMrResponse = {
    id: 100,
    iid: 5,
    title: "Add feature X",
    description: "Detailed MR description",
    state: "opened",
    web_url: "https://gitlab.example.com/group/project/-/merge_requests/5",
    source_branch: "feature-x",
    target_branch: "main",
    author: {
      username: "dev",
      name: "Developer",
      id: 5,
      state: "active",
      avatar_url: "https://example.com/avatar.jpg",
      email: "dev@example.com",
    },
    reviewers: [
      {
        username: "reviewer1",
        name: "Reviewer One",
        id: 10,
        avatar_url: "https://example.com/r1.jpg",
      },
    ],
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-06-02T12:00:00Z",
    merged_at: null,
    draft: false,
    merge_status: "can_be_merged",
    labels: ["feature", "review"],
    project_id: 42,
    user_notes_count: 3,
    upvotes: 1,
    downvotes: 0,
  };

  it("creates MR and returns normalized result", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/42\/merge_requests$/,
        method: "POST",
      })
      .reply(201, fullMrResponse);

    const result = await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
    });

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.iid).toBe(5);
    expect(data.title).toBe("Add feature X");
    expect(data.source_branch).toBe("feature-x");
    expect(data.target_branch).toBe("main");
    expect(data.state).toBe("opened");
    expect(data.author).toEqual({ username: "dev", name: "Developer" });
    expect(data.reviewers).toEqual([{ username: "reviewer1", name: "Reviewer One" }]);
    expect(data.labels).toEqual(["feature", "review"]);
    // Verify non-stable fields are removed
    expect(data).not.toHaveProperty("project_id");
    expect(data).not.toHaveProperty("user_notes_count");
    expect(data).not.toHaveProperty("upvotes");
    // Verify email is stripped from author
    expect(data.author).not.toHaveProperty("email");
    expect(data.author).not.toHaveProperty("id");
    expect(data.author).not.toHaveProperty("avatar_url");
  });

  it("sends correct POST body with all optional fields", async () => {
    let capturedBody: string | undefined;

    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/42\/merge_requests$/,
        method: "POST",
        body: (body: string) => {
          capturedBody = body;
          return true;
        },
      })
      .reply(201, fullMrResponse);

    await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
      description: "Some description",
      labels: ["feature", "review"],
      assigneeIds: [1, 2],
      reviewerIds: [3],
      milestoneId: 10,
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.source_branch).toBe("feature-x");
    expect(parsed.target_branch).toBe("main");
    expect(parsed.title).toBe("Add feature X");
    expect(parsed.description).toBe("Some description");
    expect(parsed.labels).toEqual(["feature", "review"]);
    expect(parsed.assignee_ids).toEqual([1, 2]);
    expect(parsed.reviewer_ids).toEqual([3]);
    expect(parsed.milestone_id).toBe(10);
  });

  it("only includes defined fields in POST body", async () => {
    let capturedBody: string | undefined;

    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/42\/merge_requests$/,
        method: "POST",
        body: (body: string) => {
          capturedBody = body;
          return true;
        },
      })
      .reply(201, fullMrResponse);

    await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Minimal MR",
    });

    const parsed = JSON.parse(capturedBody!);
    expect(parsed.source_branch).toBe("feature-x");
    expect(parsed.target_branch).toBe("main");
    expect(parsed.title).toBe("Minimal MR");
    // Optional fields should not be present
    expect(parsed).not.toHaveProperty("description");
    expect(parsed).not.toHaveProperty("labels");
    expect(parsed).not.toHaveProperty("assignee_ids");
    expect(parsed).not.toHaveProperty("reviewer_ids");
    expect(parsed).not.toHaveProperty("milestone_id");
  });

  it("returns error on 401", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/42\/merge_requests$/,
        method: "POST",
      })
      .reply(401, "Unauthorized");

    const result = await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("Authentication failed");
  });

  it("returns error on 403", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/42\/merge_requests$/,
        method: "POST",
      })
      .reply(403, "Forbidden");

    const result = await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("Access denied");
  });

  it("returns dry-run preview without calling API", async () => {
    const result = await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
      dryRun: true,
    });

    expect(result.isError).toBeFalsy();
    const data = result.structuredContent;
    expect(data).toBeDefined();
    expect(data!.dry_run).toBe(true);
    expect(data!.method).toBe("POST");
    expect(data!.path).toContain("/projects/42/merge_requests");
    expect(data!.body).toBeDefined();
    expect((data!.body as Record<string, unknown>).source_branch).toBe("feature-x");
    expect((data!.body as Record<string, unknown>).target_branch).toBe("main");
    expect((data!.body as Record<string, unknown>).title).toBe("Add feature X");
    expect(data!.risk_level).toBe("low");
  });

  it("encodes project path with slashes", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/group%2Fproject\/merge_requests$/,
        method: "POST",
      })
      .reply(201, fullMrResponse);

    const result = await createMergeRequest({
      projectIdOrPath: "group/project",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
    });

    expect(result.isError).toBeFalsy();
  });

  it("returns dedup cached result on identical second call", async () => {
    mockAgent
      .get("https://gitlab.example.com")
      .intercept({
        path: /\/api\/v4\/projects\/42\/merge_requests$/,
        method: "POST",
      })
      .reply(201, fullMrResponse);

    const r1 = await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
    });

    // Second call with same params should return cached result without hitting API
    const r2 = await createMergeRequest({
      projectIdOrPath: "42",
      sourceBranch: "feature-x",
      targetBranch: "main",
      title: "Add feature X",
    });

    expect(r2).toBe(r1);
  });
});
