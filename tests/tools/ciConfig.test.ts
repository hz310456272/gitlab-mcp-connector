import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { getCiConfig } from "../../src/tools/ciConfig.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

const BASE_URL = "https://gitlab.example.com";

const DEFAULT_FILE_RESPONSE = {
  file_name: ".gitlab-ci.yml",
  file_path: ".gitlab-ci.yml",
  size: 256,
  encoding: "base64",
  content: Buffer.from("stages:\n  - test\ntest_job:\n  stage: test\n  script: echo hello\n").toString("base64"),
  ref: "main",
  blob_id: "abc123",
  content_sha256: "sha256hash",
  commit_id: "def456",
  last_commit_id: "ghi789",
};

const DEFAULT_LINT_RESPONSE = {
  valid: true,
  errors: [],
  warnings: [],
  merged_yaml: "---\nstages:\n- test\ntest_job:\n  stage: test\n  script:\n  - echo hello\n",
  includes: [],
  jobs: [
    {
      name: "test_job",
      stage: "test",
      script: ["echo hello"],
      before_script: [],
      after_script: [],
      tag_list: [],
      when: "on_success",
      allow_failure: false,
    },
  ],
};

describe("gitlab_get_ci_config", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", BASE_URL);
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

  function mockFileAndLint(fileResp: Record<string, unknown> = DEFAULT_FILE_RESPONSE, lintResp: Record<string, unknown> = DEFAULT_LINT_RESPONSE) {
    mockAgent.get(BASE_URL).intercept({ path: /\/repository\/files\//, method: "GET" }).reply(200, fileResp);
    mockAgent.get(BASE_URL).intercept({ path: /\/ci\/lint/, method: "GET" }).reply(200, lintResp);
  }

  it("calls both repository file and CI lint APIs and returns combined result", async () => {
    mockFileAndLint();

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);

    expect(data.file_path).toBe(".gitlab-ci.yml");
    expect(data.content).toBe("stages:\n  - test\ntest_job:\n  stage: test\n  script: echo hello\n");
    expect(data.content_truncated).toBe(false);
    expect(data.content_encoding).toBe("utf-8");
    expect(data.valid).toBe(true);
    expect(data.errors).toEqual([]);
    expect(data.warnings).toEqual([]);
    expect(data.merged_yaml).toContain("stages:");
    expect(data.merged_yaml_truncated).toBe(false);
    expect(data.truncated).toBe(false);
    expect(data.max_bytes).toBeGreaterThan(0);
  });

  it("defaults filePath to .gitlab-ci.yml", async () => {
    const pool = mockAgent.get(BASE_URL);
    pool.intercept({ path: /\/repository\/files\/\.gitlab-ci\.yml/, method: "GET" }).reply(200, DEFAULT_FILE_RESPONSE);
    pool.intercept({ path: /\/ci\/lint/, method: "GET" }).reply(200, DEFAULT_LINT_RESPONSE);

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(false);
  });

  it("uses custom filePath for repository file only", async () => {
    const customFile = {
      ...DEFAULT_FILE_RESPONSE,
      file_name: "ci/main.yml",
      file_path: "ci/main.yml",
    };
    const pool = mockAgent.get(BASE_URL);
    pool.intercept({ path: /\/repository\/files\/ci%2Fmain\.yml/, method: "GET" }).reply(200, customFile);
    pool.intercept({ path: /\/ci\/lint/, method: "GET" }).reply(200, DEFAULT_LINT_RESPONSE);

    const result = await getCiConfig({ projectIdOrPath: "10", filePath: "ci/main.yml" });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.file_path).toBe("ci/main.yml");
    expect(data.lint_source).toBe("project_default_ci_config");
  });

  it("does not include lint_source when filePath is default", async () => {
    mockFileAndLint();

    const result = await getCiConfig({ projectIdOrPath: "10" });
    const data = JSON.parse(result.content[0].text);
    expect(data.lint_source).toBeUndefined();
  });

  it("URL-encodes project path with slashes", async () => {
    const pool = mockAgent.get(BASE_URL);
    pool
      .intercept({
        path: /\/projects\/company%2Fbackend\/repository\/files\//,
        method: "GET",
      })
      .reply(200, DEFAULT_FILE_RESPONSE);
    pool
      .intercept({
        path: /\/projects\/company%2Fbackend\/ci\/lint/,
        method: "GET",
      })
      .reply(200, DEFAULT_LINT_RESPONSE);

    const result = await getCiConfig({ projectIdOrPath: "company/backend" });
    expect(result.isError).toBe(false);
  });

  it("passes ref to both repository file (ref) and lint (content_ref)", async () => {
    const pool = mockAgent.get(BASE_URL);
    pool
      .intercept({
        path: (p: string) => p.includes("ref=feat%2Fagent") && p.includes("/repository/files/"),
        method: "GET",
      })
      .reply(200, DEFAULT_FILE_RESPONSE);
    pool
      .intercept({
        path: (p: string) => p.includes("content_ref=feat%2Fagent") && p.includes("/ci/lint"),
        method: "GET",
      })
      .reply(200, DEFAULT_LINT_RESPONSE);

    const result = await getCiConfig({ projectIdOrPath: "10", ref: "feat/agent" });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.ref).toBe("feat/agent");
  });

  it("filters blob_id, content_sha256, commit_id, last_commit_id from output", async () => {
    mockFileAndLint();

    const result = await getCiConfig({ projectIdOrPath: "10" });
    const data = JSON.parse(result.content[0].text);
    expect(data.blob_id).toBeUndefined();
    expect(data.content_sha256).toBeUndefined();
    expect(data.commit_id).toBeUndefined();
    expect(data.last_commit_id).toBeUndefined();
  });

  it("filters blob/raw URLs from includes", async () => {
    const lintWithIncludes = {
      ...DEFAULT_LINT_RESPONSE,
      includes: [
        {
          type: "local",
          location: "ci/build.yml",
          blob: "https://gitlab.example.com/group/project/-/blob/abc/ci/build.yml",
          raw: "https://gitlab.example.com/group/project/-/raw/abc/ci/build.yml",
          context_project: "group/project",
          context_sha: "abc123",
          extra: { some: "data" },
        },
      ],
    };
    mockFileAndLint(DEFAULT_FILE_RESPONSE, lintWithIncludes);

    const result = await getCiConfig({ projectIdOrPath: "10" });
    const data = JSON.parse(result.content[0].text);
    expect(data.includes).toHaveLength(1);
    expect(data.includes[0]).toEqual({
      type: "local",
      location: "ci/build.yml",
      context_project: "group/project",
      context_sha: "abc123",
    });
    expect(data.includes[0].blob).toBeUndefined();
    expect(data.includes[0].raw).toBeUndefined();
    expect(data.includes[0].extra).toBeUndefined();
  });

  it("retains name/stage/when/allow_failure in jobs, strips heavy fields", async () => {
    mockFileAndLint();

    const result = await getCiConfig({ projectIdOrPath: "10" });
    const data = JSON.parse(result.content[0].text);
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0]).toEqual({
      name: "test_job",
      stage: "test",
      when: "on_success",
      allow_failure: false,
    });
    expect(data.jobs[0].script).toBeUndefined();
    expect(data.jobs[0].before_script).toBeUndefined();
    expect(data.jobs[0].after_script).toBeUndefined();
    expect(data.jobs[0].tag_list).toBeUndefined();
  });

  it("truncates merged_yaml when over maxBytes", async () => {
    const longYaml = "stages:\n  - test\n" + "job:\n  script: echo " + "x".repeat(10000) + "\n";
    const lintWithLongYaml = { ...DEFAULT_LINT_RESPONSE, merged_yaml: longYaml };
    mockFileAndLint(DEFAULT_FILE_RESPONSE, lintWithLongYaml);

    const result = await getCiConfig({ projectIdOrPath: "10", maxBytes: 500 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.merged_yaml_truncated).toBe(true);
    expect(data.truncated).toBe(true);
    expect(data.valid).toBe(true);
    expect(data.errors).toEqual([]);
    expect(data.max_bytes).toBeGreaterThanOrEqual(500);
  });

  it("truncates content when merged_yaml already truncated", async () => {
    const longContent = "stages:\n  - test\n" + "x".repeat(5000);
    const fileWithLongContent = {
      ...DEFAULT_FILE_RESPONSE,
      content: Buffer.from(longContent).toString("base64"),
    };
    const lintWithLongYaml = {
      ...DEFAULT_LINT_RESPONSE,
      merged_yaml: "y".repeat(5000),
    };
    mockFileAndLint(fileWithLongContent, lintWithLongYaml);

    const result = await getCiConfig({ projectIdOrPath: "10", maxBytes: 1000 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.truncated).toBe(true);
  });

  it("returns toolError when repository file returns 404", async () => {
    mockAgent.get(BASE_URL).intercept({ path: /\/repository\/files\//, method: "GET" }).reply(404, "Not Found");

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });

  it("returns toolError when CI lint API fails", async () => {
    mockAgent.get(BASE_URL).intercept({ path: /\/repository\/files\//, method: "GET" }).reply(200, DEFAULT_FILE_RESPONSE);
    mockAgent.get(BASE_URL).intercept({ path: /\/ci\/lint/, method: "GET" }).reply(500, "Internal Server Error");

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("Failed to retrieve CI lint results");
  });

  it("returns valid=false with errors for invalid CI config", async () => {
    const invalidLint = {
      valid: false,
      errors: ["jobs config should contain at least one visible job"],
      warnings: [],
      merged_yaml: "---\n",
      includes: [],
      jobs: [],
    };
    mockFileAndLint(DEFAULT_FILE_RESPONSE, invalidLint);

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.valid).toBe(false);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]).toContain("at least one visible job");
  });

  it("handles empty includes and jobs arrays", async () => {
    const emptyLint = {
      valid: true,
      errors: [],
      warnings: [],
      merged_yaml: null,
      includes: [],
      jobs: [],
    };
    mockFileAndLint(DEFAULT_FILE_RESPONSE, emptyLint);

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.includes).toEqual([]);
    expect(data.jobs).toEqual([]);
  });

  it("handles non-base64 encoding gracefully", async () => {
    const nonBase64File = {
      ...DEFAULT_FILE_RESPONSE,
      encoding: "gzip",
      content: "compressed-data",
    };
    mockFileAndLint(nonBase64File, DEFAULT_LINT_RESPONSE);

    const result = await getCiConfig({ projectIdOrPath: "10" });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.content).toBe("compressed-data");
    expect(data.content_encoding).toBe("gzip");
  });
});
