import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { getPipelineJobs, getJobLog } from "../../src/tools/pipelines.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("pipeline tools", () => {
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

  const fullJobResponse = {
    id: 1001,
    name: "test",
    stage: "verify",
    status: "success",
    web_url: "https://gitlab.example.com/group/project/-/jobs/1001",
    started_at: "2025-06-01T10:10:00Z",
    finished_at: "2025-06-01T10:12:30Z",
    duration: 150.5,
    user: { username: "dev", name: "Developer" },
    runner: { id: 5, description: "shared-runner" },
    artifacts: [{ filename: "coverage.zip", size: 1024 }],
    commit: { id: "abc1234", message: "fix login" },
    pipeline: { id: 501, ref: "fix-login" },
    failure_reason: null,
    tag_list: ["docker", "linux"],
    coverage: 92.3,
  };

  describe("getPipelineJobs", () => {
    it("returns normalized jobs without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/pipelines\/501\/jobs/, method: "GET" })
        .reply(200, [fullJobResponse]);

      const result = await getPipelineJobs({ projectIdOrPath: "123", pipelineId: 501 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const job = parsed[0];
      expect(job.id).toBe(1001);
      expect(job.name).toBe("test");
      expect(job.stage).toBe("verify");
      expect(job.status).toBe("success");
      expect(job.web_url).toBe("https://gitlab.example.com/group/project/-/jobs/1001");
      expect(job.started_at).toBe("2025-06-01T10:10:00Z");
      expect(job.finished_at).toBe("2025-06-01T10:12:30Z");
      expect(job.duration).toBe(150.5);

      // Extra fields not leaked
      expect(job.user).toBeUndefined();
      expect(job.runner).toBeUndefined();
      expect(job.artifacts).toBeUndefined();
      expect(job.commit).toBeUndefined();
      expect(job.pipeline).toBeUndefined();
      expect(job.failure_reason).toBeUndefined();
      expect(job.tag_list).toBeUndefined();
      expect(job.coverage).toBeUndefined();
    });

    it("sends include_retried param correctly", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("include_retried=true");
            expect(p).not.toContain("includeRetried");
            return p.includes("/api/v4/projects/123/pipelines/501/jobs");
          },
          method: "GET",
        })
        .reply(200, []);

      await getPipelineJobs({ projectIdOrPath: "123", pipelineId: 501, includeRetried: true });
    });

    it("returns error on 404", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/pipelines\/999\/jobs/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await getPipelineJobs({ projectIdOrPath: "123", pipelineId: 999 });
      expect(result.isError).toBe(true);
    });
  });

  describe("getJobLog", () => {
    it("returns job log with metadata", async () => {
      const logContent = "Running tests...\nAll tests passed.\n";
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/jobs\/1001\/trace/, method: "GET" })
        .reply(200, logContent, { headers: { "content-type": "text/plain" } });

      const result = await getJobLog({ projectIdOrPath: "123", jobId: 1001, maxBytes: 10000 });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.job_id).toBe(1001);
      expect(parsed.trace).toBe(logContent);
      expect(parsed.truncated).toBe(false);
      expect(parsed.max_bytes).toBe(10000);
    });

    it("truncates log when exceeding maxBytes", async () => {
      const longLog = "x".repeat(5000);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/jobs\/1001\/trace/, method: "GET" })
        .reply(200, longLog, { headers: { "content-type": "text/plain" } });

      const result = await getJobLog({ projectIdOrPath: "123", jobId: 1001, maxBytes: 300 });
      const parsed = JSON.parse(result.content[0].text);
      const payloadBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadBytes).toBeLessThanOrEqual(300);
      expect(parsed.truncated).toBe(true);
      expect(parsed.job_id).toBe(1001);
      expect(parsed.max_bytes).toBe(300);
    });

    it("defaults maxBytes to 200KB", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/jobs\/1001\/trace/, method: "GET" })
        .reply(200, "ok", { headers: { "content-type": "text/plain" } });

      const result = await getJobLog({ projectIdOrPath: "123", jobId: 1001 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.max_bytes).toBe(200 * 1024);
    });

    it("returns error for non-existent job", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/jobs\/9999\/trace/, method: "GET" })
        .reply(404, "Job not found");

      const result = await getJobLog({ projectIdOrPath: "123", jobId: 9999 });
      expect(result.isError).toBe(true);
    });

    it("handles very small maxBytes budget", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/jobs\/1001\/trace/, method: "GET" })
        .reply(200, "x".repeat(200), { headers: { "content-type": "text/plain" } });

      const result = await getJobLog({ projectIdOrPath: "123", jobId: 1001, maxBytes: 80 });
      const parsed = JSON.parse(result.content[0].text);
      const payloadBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadBytes).toBeLessThanOrEqual(80);
      expect(parsed.truncated).toBe(true);
    });

    it("correctly truncates multi-byte UTF-8 log content", async () => {
      const cjkLog = "构建日志：编译成功 ✅\n" + "这是中文日志行\n".repeat(50);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*\/jobs\/1001\/trace/, method: "GET" })
        .reply(200, cjkLog, { headers: { "content-type": "text/plain" } });

      const result = await getJobLog({ projectIdOrPath: "123", jobId: 1001, maxBytes: 200 });
      const parsed = JSON.parse(result.content[0].text);
      const payloadBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadBytes).toBeLessThanOrEqual(200);
      expect(parsed.truncated).toBe(true);
    });
  });
});
