import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listJobArtifacts, getJobArtifactFile } from "../../src/tools/artifacts.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

const BASE_URL = "https://gitlab.example.com";

const DEFAULT_JOB_RESPONSE = {
  id: 123,
  name: "test-job",
  stage: "test",
  status: "success",
  web_url: "https://gitlab.example.com/group/project/-/jobs/123",
  started_at: "2025-01-01T00:00:00Z",
  finished_at: "2025-01-01T00:01:00Z",
  duration: 60,
  artifacts_expire_at: "2025-02-01T00:00:00Z",
  artifacts: [
    {
      file_type: "archive",
      filename: "artifacts.zip",
      size: 2048,
    },
    {
      file_type: "metadata",
      filename: "metadata.gz",
      size: 128,
    },
    {
      file_type: "trace",
      filename: "job.log",
      size: 512,
    },
  ],
  tag_list: ["docker"],
  runner: { id: 1, description: "shared-runner" },
  pipeline: { id: 456, sha: "abc123", ref: "main" },
};

describe("gitlab_list_job_artifacts", () => {
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

  it("returns normalized job artifacts", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123$/, method: "GET" })
      .reply(200, DEFAULT_JOB_RESPONSE);

    const result = await listJobArtifacts({ projectIdOrPath: "10", jobId: 123 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);

    expect(data.job_id).toBe(123);
    expect(data.job_name).toBe("test-job");
    expect(data.stage).toBe("test");
    expect(data.status).toBe("success");
    expect(data.artifacts).toHaveLength(3);
    expect(data.artifacts[0]).toEqual({
      file_type: "archive",
      filename: "artifacts.zip",
      size: 2048,
    });
    expect(data.artifacts_expire_at).toBe("2025-02-01T00:00:00Z");
  });

  it("handles null artifacts_expire_at", async () => {
    const jobResp = { ...DEFAULT_JOB_RESPONSE, artifacts_expire_at: null };
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123$/, method: "GET" })
      .reply(200, jobResp);

    const result = await listJobArtifacts({ projectIdOrPath: "10", jobId: 123 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.artifacts_expire_at).toBeNull();
  });

  it("strips unstable fields from output", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123$/, method: "GET" })
      .reply(200, DEFAULT_JOB_RESPONSE);

    const result = await listJobArtifacts({ projectIdOrPath: "10", jobId: 123 });
    const data = JSON.parse(result.content[0].text);
    expect(data.tag_list).toBeUndefined();
    expect(data.runner).toBeUndefined();
    expect(data.pipeline).toBeUndefined();
  });

  it("URL-encodes project path with slashes", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/group%2Fproject\/jobs\/123$/, method: "GET" })
      .reply(200, DEFAULT_JOB_RESPONSE);

    const result = await listJobArtifacts({ projectIdOrPath: "group/project", jobId: 123 });
    expect(result.isError).toBe(false);
  });

  it("returns toolError on 404", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/999$/, method: "GET" })
      .reply(404, "Not Found");

    const result = await listJobArtifacts({ projectIdOrPath: "10", jobId: 999 });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });

  it("handles empty artifacts array", async () => {
    const jobResp = { ...DEFAULT_JOB_RESPONSE, artifacts: [] };
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123$/, method: "GET" })
      .reply(200, jobResp);

    const result = await listJobArtifacts({ projectIdOrPath: "10", jobId: 123 });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.artifacts).toEqual([]);
  });
});

describe("gitlab_get_job_artifact_file", () => {
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

  it("returns text artifact content as utf-8", async () => {
    const textContent = "test report passed";
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/reports\/result\.txt$/, method: "GET" })
      .reply(200, textContent, {
        headers: { "content-type": "text/plain; charset=utf-8", "content-length": String(Buffer.byteLength(textContent)) },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "reports/result.txt",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);

    expect(data.artifact_path).toBe("reports/result.txt");
    expect(data.content).toBe("test report passed");
    expect(data.binary).toBe(false);
    expect(data.size).toBe(Buffer.byteLength(textContent));
    expect(data.truncated).toBe(false);
    expect(data.max_bytes).toBe(200 * 1024);
  });

  it("returns json artifact as utf-8", async () => {
    const jsonContent = JSON.stringify({ tests: 10, passed: 10 });
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/report\.json$/, method: "GET" })
      .reply(200, jsonContent, {
        headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(jsonContent)) },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "report.json",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.binary).toBe(false);
    expect(data.content).toBe(jsonContent);
  });

  it("returns binary artifact as base64", async () => {
    const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/image\.png$/, method: "GET" })
      .reply(200, binaryBuf, {
        headers: { "content-type": "image/png", "content-length": String(binaryBuf.length) },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "image.png",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.binary).toBe(true);
    expect(data.encoding).toBe("base64");
    expect(data.content).toBe(binaryBuf.toString("base64"));
  });

  it("detects binary content via NUL byte even with text content-type", async () => {
    const bufWithNul = Buffer.from("hello\x00world");
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/data\.bin$/, method: "GET" })
      .reply(200, bufWithNul, {
        headers: { "content-type": "application/octet-stream", "content-length": String(bufWithNul.length) },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "data.bin",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.binary).toBe(true);
    expect(data.encoding).toBe("base64");
  });

  it("uses buffer byte length when Content-Length is missing", async () => {
    const textContent = "no content-length header";
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/output\.txt$/, method: "GET" })
      .reply(200, textContent, {
        headers: { "content-type": "text/plain" },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "output.txt",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.size).toBe(Buffer.byteLength(textContent));
  });

  it("truncates content when over maxBytes", async () => {
    const longContent = "x".repeat(5000);
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/big\.txt$/, method: "GET" })
      .reply(200, longContent, {
        headers: { "content-type": "text/plain; charset=utf-8", "content-length": String(Buffer.byteLength(longContent)) },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "big.txt",
      maxBytes: 500,
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.truncated).toBe(true);
    expect(data.max_bytes).toBeGreaterThanOrEqual(500);
    expect(data.binary).toBe(false);
  });

  it("URL-encodes artifact path segments preserving slashes", async () => {
    // "reports/测试 报告.xml" → segments ["reports", "测试 报告.xml"]
    // encoded: "reports/%E6%B5%8B%E8%AF%95%20%E6%8A%A5%E5%91%8A.xml"
    mockAgent
      .get(BASE_URL)
      .intercept({
        path: (p: string) => p.includes("/artifacts/reports/%E6%B5%8B%E8%AF%95%20%E6%8A%A5%E5%91%8A.xml"),
        method: "GET",
      })
      .reply(200, "chinese content", {
        headers: { "content-type": "text/plain" },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "reports/测试 报告.xml",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.artifact_path).toBe("reports/测试 报告.xml");
  });

  it("URL-encodes project path with slashes", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({
        path: /\/projects\/group%2Fproject\/jobs\/123\/artifacts\/result\.txt$/,
        method: "GET",
      })
      .reply(200, "ok", {
        headers: { "content-type": "text/plain" },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "group/project",
      jobId: 123,
      artifactPath: "result.txt",
    });
    expect(result.isError).toBe(false);
  });

  it("rejects artifactPath with .. segment", async () => {
    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "../secret.txt",
    });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain("artifactPath");
  });

  it("rejects artifactPath with . segment", async () => {
    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "./report.txt",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects empty artifactPath", async () => {
    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects artifactPath starting with /", async () => {
    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "/absolute/path.txt",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects artifactPath with empty segments (a//b)", async () => {
    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "a//b.txt",
    });
    expect(result.isError).toBe(true);
  });

  it("returns toolError on 404", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\//, method: "GET" })
      .reply(404, "Not Found");

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "missing.txt",
    });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBeDefined();
  });

  it("reports correct artifact_path in output matching user input", async () => {
    mockAgent
      .get(BASE_URL)
      .intercept({ path: /\/projects\/10\/jobs\/123\/artifacts\/report\.txt$/, method: "GET" })
      .reply(200, "ok", {
        headers: { "content-type": "text/plain" },
      });

    const result = await getJobArtifactFile({
      projectIdOrPath: "10",
      jobId: 123,
      artifactPath: "report.txt",
    });
    expect(result.isError).toBe(false);
    const data = JSON.parse(result.content[0].text);
    expect(data.artifact_path).toBe("report.txt");
    expect(data.job_id).toBe(123);
  });
});
