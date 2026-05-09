import { describe, it, expect } from "vitest";
import {
  normalizeTreeNodeList,
  normalizeCommit,
  normalizeCommitList,
  normalizeCompareResult,
  normalizeIssue,
  normalizeIssueList,
  normalizeLabel,
  normalizeLabelList,
  normalizeMilestone,
  normalizeMilestoneList,
  normalizeRelease,
  normalizeReleaseList,
  normalizeGroup,
  normalizeGroupList,
  normalizeSearchProject,
  normalizeSearchIssue,
  normalizeSearchMergeRequest,
  normalizeSearchMilestone,
  normalizeSearchCommit,
  normalizeSearchBlob,
  normalizeSearchNote,
  normalizeSearchWikiBlob,
  normalizeSearchUser,
} from "../../src/tools/normalize.js";

describe("normalizeTreeNode", () => {
  it("picks stable fields and strips unstable ones", () => {
    const raw = [
      {
        id: "abc123def",
        name: "src",
        type: "tree",
        path: "src",
        mode: "040000",
      },
      {
        id: "def456",
        name: "README.md",
        type: "blob",
        path: "README.md",
        mode: "100644",
      },
    ];

    const result = normalizeTreeNodeList(raw);
    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      id: "abc123def",
      name: "src",
      type: "tree",
      path: "src",
      mode: "040000",
    });
    expect(result[1]).toEqual({
      id: "def456",
      name: "README.md",
      type: "blob",
      path: "README.md",
      mode: "100644",
    });
  });

  it("handles missing optional fields gracefully", () => {
    const raw = [{ name: "file.txt", type: "blob", path: "file.txt" }];
    const result = normalizeTreeNodeList(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: undefined,
      name: "file.txt",
      type: "blob",
      path: "file.txt",
      mode: undefined,
    });
  });
});

describe("normalizeCommit", () => {
  it("list view: stable fields including emails, no message/stats", () => {
    const raw = {
      id: "abc123def456",
      short_id: "abc123de",
      title: "feat: add new feature",
      author_name: "John",
      author_email: "john@example.com",
      authored_date: "2025-01-01T00:00:00Z",
      committer_name: "John",
      committer_email: "john@example.com",
      committed_date: "2025-01-01T00:00:01Z",
      message: "feat: add new feature\n\nWith details",
      parent_ids: ["parent1", "parent2"],
      web_url: "https://gitlab.example.com/commit/abc123",
      project_id: 42,
      trailers: {},
      extended_trailers: {},
      signed_off_by: "John",
      status: "running",
      last_pipeline: { id: 99 },
    };

    const result = normalizeCommit(raw, false);
    expect(result).toEqual({
      id: "abc123def456",
      short_id: "abc123de",
      title: "feat: add new feature",
      author_name: "John",
      author_email: "john@example.com",
      authored_date: "2025-01-01T00:00:00Z",
      committer_name: "John",
      committer_email: "john@example.com",
      committed_date: "2025-01-01T00:00:01Z",
      web_url: "https://gitlab.example.com/commit/abc123",
      parent_ids: ["parent1", "parent2"],
    });
    expect(result).not.toHaveProperty("message");
    expect(result).not.toHaveProperty("stats");
    expect(result).not.toHaveProperty("project_id");
    expect(result).not.toHaveProperty("trailers");
    expect(result).not.toHaveProperty("extended_trailers");
    expect(result).not.toHaveProperty("signed_off_by");
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("last_pipeline");
  });

  it("detail view: includes message and stats on top of list fields", () => {
    const raw = {
      id: "abc123",
      short_id: "abc123",
      title: "fix: bug",
      message: "fix: bug\n\nDetailed description",
      author_name: "Jane",
      author_email: "jane@example.com",
      authored_date: "2025-01-01T00:00:00Z",
      committer_name: "Jane",
      committer_email: "jane@example.com",
      committed_date: "2025-01-01T00:00:00Z",
      web_url: "https://gitlab.example.com/commit/abc123",
      stats: { additions: 5, deletions: 3, total_changes: 8 },
      trailers: {},
      project_id: 7,
    };

    const result = normalizeCommit(raw, true);
    expect(result.message).toBe("fix: bug\n\nDetailed description");
    expect(result.stats).toEqual({ additions: 5, deletions: 3, total_changes: 8 });
    expect(result.author_email).toBe("jane@example.com");
    expect(result.committer_name).toBe("Jane");
    expect(result.committer_email).toBe("jane@example.com");
    expect(result).not.toHaveProperty("project_id");
    expect(result).not.toHaveProperty("trailers");
  });

  it("detail view without stats: omits stats field", () => {
    const raw = {
      id: "abc",
      short_id: "abc",
      title: "t",
      message: "msg",
      author_name: "A",
      authored_date: "2025-01-01T00:00:00Z",
      committed_date: "2025-01-01T00:00:00Z",
      web_url: "https://gitlab.example.com/commit/abc",
    };

    const result = normalizeCommit(raw, true);
    expect(result.message).toBe("msg");
    expect(result).not.toHaveProperty("stats");
  });
});

describe("normalizeCommitList", () => {
  it("normalizes each commit without message or stats, keeps emails", () => {
    const raw = [
      {
        id: "aaa",
        short_id: "aaa",
        title: "first",
        author_name: "A",
        author_email: "a@example.com",
        authored_date: "2025-01-01T00:00:00Z",
        committer_name: "A",
        committer_email: "a@example.com",
        committed_date: "2025-01-01T00:00:00Z",
        message: "should not appear",
        web_url: "https://gitlab.example.com/commit/aaa",
        stats: { additions: 1, deletions: 0, total_changes: 1 },
        project_id: 5,
      },
    ];

    const result = normalizeCommitList(raw);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("aaa");
    expect(result[0].title).toBe("first");
    expect(result[0].author_email).toBe("a@example.com");
    expect(result[0].committer_name).toBe("A");
    expect(result[0].committer_email).toBe("a@example.com");
    expect(result[0]).not.toHaveProperty("message");
    expect(result[0]).not.toHaveProperty("stats");
    expect(result[0]).not.toHaveProperty("project_id");
  });
});

describe("normalizeCompareResult", () => {
  it("normalizes commits and diffs, respects maxFiles and maxBytes", () => {
    const raw = {
      commits: [
        {
          id: "aaa",
          short_id: "aaa",
          title: "commit 1",
          author_name: "A",
          authored_date: "2025-01-01T00:00:00Z",
          committed_date: "2025-01-01T00:00:00Z",
          web_url: "https://gitlab.example.com/commit/aaa",
        },
      ],
      diffs: [
        {
          old_path: "a.txt",
          new_path: "a.txt",
          new_file: false,
          deleted_file: false,
          diff: "@@ -1 +1 @@\n-old\n+new\n",
        },
        {
          old_path: "b.txt",
          new_path: "b.txt",
          new_file: true,
          deleted_file: false,
          diff: "@@ -0,0 +1 @@\n+content\n",
        },
      ],
    };

    const result = normalizeCompareResult(raw, { maxFiles: 1, maxBytes: 10000 });
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].id).toBe("aaa");
    expect(result.diffs).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.diffs[0].old_path).toBe("a.txt");
    expect(result.max_bytes).toBe(10000);
  });

  it("small maxBytes: drops diffs first, then trims commits if needed, payload never exceeds limit", () => {
    const raw = {
      commits: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        short_id: `c${i}`,
        title: `commit ${i}`,
        author_name: "A",
        authored_date: "2025-01-01T00:00:00Z",
        committed_date: "2025-01-01T00:00:00Z",
        web_url: "https://gitlab.example.com/commit/c" + i,
      })),
      diffs: [{ old_path: "f.txt", new_path: "f.txt", diff: "x".repeat(500) }],
    };

    const result = normalizeCompareResult(raw, { maxBytes: 500 });
    const payloadSize = Buffer.byteLength(JSON.stringify(result), "utf8");
    expect(payloadSize).toBeLessThanOrEqual(500);
    expect(result.truncated).toBe(true);
    // Commits may be trimmed, but diffs are definitely gone
    expect(result.diffs).toHaveLength(0);
    expect(result.max_bytes).toBe(500);
  });

  it("without maxBytes: no max_bytes field, no truncation", () => {
    const raw = {
      commits: [{ id: "a", short_id: "a", title: "t", author_name: "A", authored_date: "2025-01-01T00:00:00Z", committed_date: "2025-01-01T00:00:00Z", web_url: "https://gitlab.example.com/commit/a" }],
      diffs: [{ old_path: "f.txt", new_path: "f.txt", diff: "x" }],
    };

    const result = normalizeCompareResult(raw);
    expect(result.truncated).toBe(false);
    expect(result.commits).toHaveLength(1);
    expect(result.diffs).toHaveLength(1);
    expect(result).not.toHaveProperty("max_bytes");
  });
});

const fullIssueResponse = {
  id: 42,
  iid: 7,
  title: "Fix login bug",
  description: "This is a detailed description of the issue.\nIt has multiple lines.",
  state: "opened",
  web_url: "https://gitlab.example.com/group/project/-/issues/7",
  author: { username: "dev", name: "Developer", id: 5, state: "active", avatar_url: "https://example.com/avatar.jpg" },
  assignees: [
    { username: "assignee1", name: "Assignee 1", id: 10, avatar_url: "https://example.com/a1.jpg" },
  ],
  labels: ["bug", "urgent"],
  milestone: {
    id: 3,
    iid: 1,
    title: "v1.0",
    state: "active",
    description: "First release",
    due_date: "2025-12-31",
    start_date: "2025-01-01",
    web_url: "https://gitlab.example.com/group/project/-/milestones/1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    expired: false,
    group_id: 1,
    project_id: 2,
  },
  type: "issue",
  confidential: true,
  created_at: "2025-06-01T10:00:00Z",
  updated_at: "2025-06-02T12:00:00Z",
  closed_at: null,
  due_date: "2025-12-01",
  project_id: 99,
  moved_to: null,
  time_stats: { time_estimate: 3600, total_time_spent: 1800 },
  weight: 3,
  health_status: "on_track",
  user_notes_count: 15,
  merge_requests_count: 2,
  task_completion_status: { count: 5, completed_count: 3 },
  subscribed: true,
  participant_count: 4,
  subscribers_count: 2,
  upvotes: 1,
  downvotes: 0,
  _links: { self: "https://gitlab.example.com/api/v4/issues/42" },
};

describe("normalizeIssue", () => {
  it("picks stable fields and strips unstable ones", () => {
    const result = normalizeIssue(fullIssueResponse);

    expect(result).toEqual({
      id: 42,
      iid: 7,
      title: "Fix login bug",
      description: "This is a detailed description of the issue.\nIt has multiple lines.",
      state: "opened",
      web_url: "https://gitlab.example.com/group/project/-/issues/7",
      author: { username: "dev", name: "Developer" },
      assignees: [{ username: "assignee1", name: "Assignee 1" }],
      labels: ["bug", "urgent"],
      milestone: { id: 3, title: "v1.0", state: "active" },
      type: "issue",
      confidential: true,
      created_at: "2025-06-01T10:00:00Z",
      updated_at: "2025-06-02T12:00:00Z",
      closed_at: null,
      due_date: "2025-12-01",
    });

    expect(result).not.toHaveProperty("project_id");
    expect(result).not.toHaveProperty("moved_to");
    expect(result).not.toHaveProperty("time_stats");
    expect(result).not.toHaveProperty("weight");
    expect(result).not.toHaveProperty("health_status");
    expect(result).not.toHaveProperty("user_notes_count");
    expect(result).not.toHaveProperty("subscribed");
    expect(result).not.toHaveProperty("_links");
  });

  it("omits type when not present", () => {
    const raw = { id: 1, iid: 1, title: "t", state: "opened", description: null, web_url: "u", confidential: false, created_at: "2025-01-01", updated_at: "2025-01-01", closed_at: null, due_date: null, labels: [], assignees: [] };
    const result = normalizeIssue(raw);
    expect(result).not.toHaveProperty("type");
  });

  it("milestone null when absent", () => {
    const raw = { ...fullIssueResponse, milestone: null };
    const result = normalizeIssue(raw);
    expect(result.milestone).toBeNull();
  });

  it("empty assignees array", () => {
    const raw = { ...fullIssueResponse, assignees: [] };
    const result = normalizeIssue(raw);
    expect(result.assignees).toEqual([]);
  });

  it("truncates description when descriptionMaxChars is set", () => {
    const raw = { ...fullIssueResponse, description: "A".repeat(1000) };
    const result = normalizeIssue(raw, { descriptionMaxChars: 500 });
    expect((result.description as string).length).toBe(500);
    expect(result.description_truncated).toBe(true);
  });

  it("does not set description_truncated when description fits", () => {
    const raw = { ...fullIssueResponse, description: "Short" };
    const result = normalizeIssue(raw, { descriptionMaxChars: 500 });
    expect(result.description).toBe("Short");
    expect(result).not.toHaveProperty("description_truncated");
  });

  it("does not truncate when descriptionMaxChars is not set", () => {
    const raw = { ...fullIssueResponse, description: "A".repeat(1000) };
    const result = normalizeIssue(raw);
    expect((result.description as string).length).toBe(1000);
    expect(result).not.toHaveProperty("description_truncated");
  });
});

describe("normalizeIssueList", () => {
  it("normalizes each issue with description truncation", () => {
    const raw = [
      { ...fullIssueResponse, description: "A".repeat(1000) },
      { ...fullIssueResponse, id: 43, description: "Short" },
    ];
    const result = normalizeIssueList(raw, { descriptionMaxChars: 500 });
    expect(result).toHaveLength(2);
    expect((result[0].description as string).length).toBe(500);
    expect(result[0].description_truncated).toBe(true);
    expect(result[1].description).toBe("Short");
    expect(result[1]).not.toHaveProperty("description_truncated");
  });
});

describe("normalizeLabel", () => {
  it("picks stable fields and strips unstable ones", () => {
    const raw = {
      id: 1,
      name: "bug",
      color: "#FF0000",
      text_color: "#FFFFFF",
      description: "Bug report",
      open_issues_count: 10,
      closed_issues_count: 5,
      open_merge_requests_count: 3,
      subscribed: false,
      priority: 1,
      description_html: "<p>Bug report</p>",
      is_project_label: true,
    };

    const result = normalizeLabel(raw);
    expect(result).toEqual({
      id: 1,
      name: "bug",
      color: "#FF0000",
      text_color: "#FFFFFF",
      description: "Bug report",
    });
    expect(result).not.toHaveProperty("open_issues_count");
    expect(result).not.toHaveProperty("subscribed");
    expect(result).not.toHaveProperty("priority");
  });
});

describe("normalizeLabelList", () => {
  it("maps each label", () => {
    const raw = [
      { id: 1, name: "bug", color: "#FF0000", text_color: "#FFFFFF" },
      { id: 2, name: "feature", color: "#00FF00", text_color: "#000000" },
    ];
    const result = normalizeLabelList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("bug");
    expect(result[1].name).toBe("feature");
  });
});

describe("normalizeMilestone", () => {
  it("picks stable fields and strips unstable ones", () => {
    const raw = {
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

    const result = normalizeMilestone(raw);
    expect(result).toEqual({
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
    expect(result).not.toHaveProperty("group_id");
    expect(result).not.toHaveProperty("project_id");
    expect(result).not.toHaveProperty("user_notes_count");
  });
});

describe("normalizeMilestoneList", () => {
  it("maps each milestone", () => {
    const raw = [
      { id: 1, iid: 1, title: "v1.0", state: "closed", expired: true },
      { id: 2, iid: 2, title: "v2.0", state: "active", expired: false },
    ];
    const result = normalizeMilestoneList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("v1.0");
    expect(result[1].title).toBe("v2.0");
  });
});

const fullReleaseResponse = {
  tag_name: "v1.0.0",
  name: "Version 1.0.0",
  description: "This is the first stable release.",
  created_at: "2025-06-01T10:00:00Z",
  released_at: "2025-06-01T10:00:00Z",
  upcoming_release: false,
  author: {
    id: 5,
    username: "dev",
    name: "Developer",
    state: "active",
    avatar_url: "https://example.com/avatar.jpg",
  },
  commit: {
    id: "abc123def456",
    short_id: "abc123de",
    title: "Release commit",
    author_name: "dev",
    authored_date: "2025-05-30T10:00:00Z",
  },
  commit_path: "/group/project/-/commit/abc123",
  tag_path: "/group/project/-/tags/v1.0.0",
  milestones: [
    { id: 1, iid: 1, title: "v1.0", state: "closed", description: "M1", due_date: "2025-06-01" },
  ],
  assets: {
    count: 2,
    sources: [
      { format: "zip", url: "https://gitlab.example.com/archive.zip" },
    ],
    links: [
      { id: 10, name: "binary", url: "https://example.com/download", external: true, link_type: "other" },
    ],
  },
  evidences: [{ sha: "abc", filepath: "evidence.json" }],
  _links: { self: "https://gitlab.example.com/releases/v1.0.0" },
};

describe("normalizeRelease", () => {
  it("picks stable fields and strips unstable ones", () => {
    const result = normalizeRelease(fullReleaseResponse);
    expect(result).toEqual({
      tag_name: "v1.0.0",
      name: "Version 1.0.0",
      description: "This is the first stable release.",
      description_truncated: false,
      created_at: "2025-06-01T10:00:00Z",
      released_at: "2025-06-01T10:00:00Z",
      author: { username: "dev", name: "Developer" },
      commit: { short_id: "abc123de", title: "Release commit", authored_date: "2025-05-30T10:00:00Z" },
      milestones: [{ id: 1, title: "v1.0", state: "closed" }],
      assets: {
        count: 2,
        links: [{ id: 10, name: "binary", url: "https://example.com/download", external: true, link_type: "other" }],
      },
    });
    expect(result).not.toHaveProperty("upcoming_release");
    expect(result).not.toHaveProperty("_links");
    expect(result).not.toHaveProperty("evidences");
    expect(result).not.toHaveProperty("tag_path");
  });

  it("handles null commit and null assets", () => {
    const raw = { ...fullReleaseResponse, commit: null, assets: null };
    const result = normalizeRelease(raw);
    expect(result.commit).toBeUndefined();
    expect(result.assets.count).toBe(0);
    expect(result.assets.links).toEqual([]);
  });

  it("handles empty milestones", () => {
    const raw = { ...fullReleaseResponse, milestones: [] };
    const result = normalizeRelease(raw);
    expect(result.milestones).toEqual([]);
  });

  it("truncates description when descriptionMaxChars is set", () => {
    const raw = { ...fullReleaseResponse, description: "A".repeat(1000) };
    const result = normalizeRelease(raw, { descriptionMaxChars: 500 });
    expect((result.description as string).length).toBe(500);
    expect(result.description_truncated).toBe(true);
  });

  it("does not set description_truncated when description fits", () => {
    const raw = { ...fullReleaseResponse, description: "Short" };
    const result = normalizeRelease(raw, { descriptionMaxChars: 500 });
    expect(result.description).toBe("Short");
    expect(result.description_truncated).toBe(false);
  });

  it("does not truncate when descriptionMaxChars is not set", () => {
    const raw = { ...fullReleaseResponse, description: "A".repeat(1000) };
    const result = normalizeRelease(raw);
    expect((result.description as string).length).toBe(1000);
    expect(result.description_truncated).toBe(false);
  });
});

describe("normalizeReleaseList", () => {
  it("normalizes each release with description truncation", () => {
    const raw = [
      { ...fullReleaseResponse, description: "A".repeat(1000) },
      { ...fullReleaseResponse, tag_name: "v2.0.0", description: "Short" },
    ];
    const result = normalizeReleaseList(raw);
    expect(result).toHaveLength(2);
    expect((result[0].description as string).length).toBe(500);
    expect(result[0].description_truncated).toBe(true);
    expect(result[1].description).toBe("Short");
    expect(result[1].description_truncated).toBe(false);
  });
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
  ldap_cn: "backend-team",
  shared_with_groups: [{ group_id: 10 }],
  request_access_enabled: true,
  default_branch_protection: 2,
};

describe("normalizeGroup", () => {
  it("picks stable fields and strips unstable ones", () => {
    const result = normalizeGroup(fullGroupResponse);
    expect(result).toEqual({
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
    expect(result).not.toHaveProperty("avatar_url");
    expect(result).not.toHaveProperty("runners_token");
    expect(result).not.toHaveProperty("statistics");
    expect(result).not.toHaveProperty("ldap_cn");
    expect(result).not.toHaveProperty("shared_with_groups");
    expect(result).not.toHaveProperty("request_access_enabled");
    expect(result).not.toHaveProperty("default_branch_protection");
  });

  it("handles null parent_id for top-level group", () => {
    const raw = { ...fullGroupResponse, parent_id: null };
    const result = normalizeGroup(raw);
    expect(result.parent_id).toBeNull();
  });

  it("handles null description", () => {
    const raw = { ...fullGroupResponse, description: null };
    const result = normalizeGroup(raw);
    expect(result.description).toBeNull();
  });
});

describe("normalizeGroupList", () => {
  it("maps each group", () => {
    const raw = [
      { ...fullGroupResponse, id: 1, path: "company", full_path: "company" },
      { ...fullGroupResponse, id: 5, path: "backend", full_path: "company/backend" },
    ];
    const result = normalizeGroupList(raw);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("company");
    expect(result[1].path).toBe("backend");
  });
});

// --- Search result normalizers ---

describe("normalizeSearchProject", () => {
  it("retains id, name, path_with_namespace; drops avatar_url", () => {
    const result = normalizeSearchProject({
      id: 10,
      name: "api-service",
      path_with_namespace: "company/backend/api-service",
      description: "API service",
      default_branch: "main",
      visibility: "private",
      web_url: "https://gitlab.example.com/company/backend/api-service",
      avatar_url: "https://gitlab.example.com/uploads/avatar.png",
      star_count: 5,
    });
    expect(result).toEqual({
      id: 10,
      name: "api-service",
      path_with_namespace: "company/backend/api-service",
      description: "API service",
      default_branch: "main",
      visibility: "private",
      web_url: "https://gitlab.example.com/company/backend/api-service",
    });
  });
});

describe("normalizeSearchIssue", () => {
  it("retains project_id and iid for follow-up tool calls", () => {
    const result = normalizeSearchIssue({
      id: 42,
      iid: 7,
      project_id: 10,
      title: "Fix login bug",
      description: "Details",
      state: "opened",
      web_url: "https://gitlab.example.com/company/project/-/issues/7",
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
      labels: ["bug"],
      updated_at: "2025-06-02T12:00:00Z",
    });
    expect(result).toEqual({
      id: 42,
      iid: 7,
      project_id: 10,
      title: "Fix login bug",
      state: "opened",
      web_url: "https://gitlab.example.com/company/project/-/issues/7",
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
    });
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("labels");
    expect(result).not.toHaveProperty("updated_at");
  });
});

describe("normalizeSearchMergeRequest", () => {
  it("retains project_id and iid for follow-up tool calls", () => {
    const result = normalizeSearchMergeRequest({
      id: 100,
      iid: 5,
      project_id: 10,
      title: "Add feature",
      description: "Details",
      state: "opened",
      web_url: "https://gitlab.example.com/company/project/-/merge_requests/5",
      source_branch: "feature",
      target_branch: "main",
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
      labels: ["feature"],
    });
    expect(result).toEqual({
      id: 100,
      iid: 5,
      project_id: 10,
      title: "Add feature",
      state: "opened",
      web_url: "https://gitlab.example.com/company/project/-/merge_requests/5",
      source_branch: "feature",
      target_branch: "main",
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
    });
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("labels");
  });
});

describe("normalizeSearchMilestone", () => {
  it("retains project_id and iid", () => {
    const result = normalizeSearchMilestone({
      id: 3,
      iid: 1,
      project_id: 10,
      title: "v1.0",
      description: "First release",
      state: "active",
      web_url: "https://gitlab.example.com/company/project/-/milestones/1",
      due_date: "2025-12-31",
      start_date: "2025-01-01",
    });
    expect(result).toEqual({
      id: 3,
      iid: 1,
      project_id: 10,
      title: "v1.0",
      state: "active",
      web_url: "https://gitlab.example.com/company/project/-/milestones/1",
      due_date: "2025-12-31",
    });
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("start_date");
  });
});

describe("normalizeSearchCommit", () => {
  it("retains project_id for follow-up tool calls", () => {
    const result = normalizeSearchCommit({
      id: "abc123def456",
      short_id: "abc123de",
      title: "feat: add search",
      project_id: 10,
      author_name: "dev",
      author_email: "dev@example.com",
      authored_date: "2025-06-01T10:00:00Z",
      web_url: "https://gitlab.example.com/company/project/-/commit/abc123",
      committer_name: "dev",
      parent_ids: ["parent1"],
    });
    expect(result).toEqual({
      id: "abc123def456",
      short_id: "abc123de",
      title: "feat: add search",
      project_id: 10,
      author_name: "dev",
      authored_date: "2025-06-01T10:00:00Z",
      web_url: "https://gitlab.example.com/company/project/-/commit/abc123",
    });
    expect(result).not.toHaveProperty("author_email");
    expect(result).not.toHaveProperty("committer_name");
    expect(result).not.toHaveProperty("parent_ids");
  });
});

describe("normalizeSearchBlob", () => {
  it("truncates data over 500 chars with data_truncated=true", () => {
    const longData = "x".repeat(600);
    const result = normalizeSearchBlob({
      blob_id: "sha123",
      basename: "file.ts",
      path: "src/file.ts",
      data: longData,
      filename: "file.ts",
      startline: 10,
      project_id: 10,
      ref: "main",
    });
    expect((result.data as string).length).toBe(500);
    expect(result.data_truncated).toBe(true);
    expect(result.project_id).toBe(10);
    expect(result.ref).toBe("main");
    expect(result.path).toBe("src/file.ts");
  });

  it("keeps short data intact with data_truncated=false", () => {
    const result = normalizeSearchBlob({
      blob_id: "sha123",
      basename: "file.ts",
      path: "src/file.ts",
      data: "short content",
      filename: "file.ts",
      startline: 1,
      project_id: 10,
      ref: "main",
    });
    expect(result.data).toBe("short content");
    expect(result.data_truncated).toBe(false);
  });
});

describe("normalizeSearchNote", () => {
  it("truncates body over 500 chars with body_truncated=true", () => {
    const longBody = "y".repeat(600);
    const result = normalizeSearchNote({
      id: 500,
      type: "DiscussionNote",
      body: longBody,
      noteable_id: 42,
      noteable_type: "Issue",
      project_id: 10,
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
    });
    expect((result.body as string).length).toBe(500);
    expect(result.body_truncated).toBe(true);
  });

  it("retains noteable_id, noteable_type, project_id for follow-up", () => {
    const result = normalizeSearchNote({
      id: 500,
      body: "Looks good",
      noteable_id: 42,
      noteable_type: "MergeRequest",
      project_id: 10,
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
    });
    expect(result).toEqual({
      id: 500,
      body: "Looks good",
      body_truncated: false,
      noteable_id: 42,
      noteable_type: "MergeRequest",
      project_id: 10,
      author: { username: "dev", name: "Developer" },
      created_at: "2025-06-01T10:00:00Z",
    });
  });
});

describe("normalizeSearchWikiBlob", () => {
  it("truncates data over 500 chars and retains slug, project_id", () => {
    const longData = "z".repeat(700);
    const result = normalizeSearchWikiBlob({
      slug: "home",
      basename: "home",
      path: "home.md",
      data: longData,
      filename: "home.md",
      project_id: 10,
      ref: "main",
    });
    expect((result.data as string).length).toBe(500);
    expect(result.data_truncated).toBe(true);
    expect(result.slug).toBe("home");
    expect(result.project_id).toBe(10);
  });
});

describe("normalizeSearchUser", () => {
  it("retains id, username, name, state, web_url; drops avatar_url", () => {
    const result = normalizeSearchUser({
      id: 5,
      username: "dev",
      name: "Developer",
      state: "active",
      web_url: "https://gitlab.example.com/dev",
      avatar_url: "https://gitlab.example.com/uploads/avatar.png",
      email: "dev@example.com",
    });
    expect(result).toEqual({
      id: 5,
      username: "dev",
      name: "Developer",
      state: "active",
      web_url: "https://gitlab.example.com/dev",
    });
    expect(result).not.toHaveProperty("avatar_url");
    expect(result).not.toHaveProperty("email");
  });
});
